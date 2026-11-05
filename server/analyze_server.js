import express from "express";
import yaml from "js-yaml";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import dotenv from "dotenv";
import { buildEntityCards, createAutomationDraft, LLM_PIPELINE_VERSION } from "./llm_draft_service.mjs";
import { GOAL_PROMPT_VERSION } from "./automation_goal_analyzer.mjs";
import { DRAFT_PROMPT_VERSION } from "./ollama_automation_provider.mjs";
import { ControlNowError, createControlNowService } from "./control_now_service.mjs";
import { createAssistantRequestRouter } from "./assistant_request_router.mjs";
import {
    ProviderNeutralAssistantError,
    createProviderNeutralAssistantAdapter,
} from "./provider_neutral_assistant_adapter.mjs";
import {
    createCapabilityRegistry,
    publicInformationServices,
    publicCapabilityContext,
} from "./capability_registry.mjs";
import {
    resolveExplicitEntityReferences,
    retrieveEntityContext,
    withoutAutomationRuleReferences,
} from "./entity_retriever.mjs";
import { executeInformationQuery } from "./information_query.mjs";
import { buildAutomationPlannerCommand, normalizeAutomationContext } from "./automation_context.mjs";
import {
    catalogEntryFromConfig,
    isActiveAutomationState,
    resolveAutomationReference,
} from "./automation_catalog.mjs";
import { filterAssistantEntityStates } from "./entity_visibility_policy.mjs";
import { validateHostAutomation } from "./automation_host_validation.mjs";
import { validateModificationPreservation } from "./modification_preservation.mjs";

dotenv.config();

const app = express();
app.use(express.json({ limit: "10mb" }));

const PY_PATH = path.resolve(
    __dirname,
    "../src/homeassistant/conflict_analyzer/ha_eca_conflict_analyzer.py"
);
const PY_CMD = "python";
const HOST = process.env.ANALYZER_HOST || "127.0.0.1";
const PORT = Number(process.env.ANALYZER_PORT || "8787");
const LLM_ASSISTANT_BACKEND = String(process.env.LLM_ASSISTANT_BACKEND || "ollama").trim().toLowerCase();
const CAPABILITY_CACHE_TTL_MS = Math.max(5_000, Number(process.env.HA_CAPABILITY_CACHE_TTL_MS || "60000"));
const providerNeutralAssistant = createProviderNeutralAssistantAdapter();
let cachedCapabilityRegistry = null;
const AUTOMATION_CONFIG_CACHE_TTL_MS = Math.max(5_000, Number(process.env.HA_AUTOMATION_CACHE_TTL_MS || "60000"));
const AUTOMATION_CONFIG_CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.HA_AUTOMATION_FETCH_CONCURRENCY || "4")));
const cachedAutomationConfigs = new Map();
const GROUNDING_MIN_MARGIN = Math.max(0, Number(process.env.LLM_GROUNDING_MIN_MARGIN || "0.02"));

function buildHaBaseUrl() {
    if (process.env.HA_BASE_URL) return process.env.HA_BASE_URL;
    const ip = process.env.HA_IP;
    const port = process.env.HA_PORT || "8123";
    if (!ip) return "";
    return `http://${ip}:${port}`;
}

function isLocalAddress(addr) {
    return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

function guardLocal(req, res) {
    const addr = String(req.socket?.remoteAddress || "");
    if (!isLocalAddress(addr)) {
        res.status(403).json({ error: "forbidden" });
        return false;
    }
    return true;
}

async function fetchHomeAssistantStates() {
    const haBase = buildHaBaseUrl();
    const haToken = process.env.HA_TOKEN || "";
    if (!haBase || !haToken) {
        throw new Error("Missing HA_BASE_URL(or HA_IP/HA_PORT) or HA_TOKEN in server .env");
    }

    const response = await fetch(`${haBase.replace(/\/$/, "")}/api/states`, {
        headers: {
            Authorization: `Bearer ${haToken}`,
            "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
        throw new Error(`Home Assistant states request failed: ${response.status}`);
    }
    const states = await response.json();
    if (!Array.isArray(states)) {
        throw new Error("Home Assistant states response was not an array");
    }
    return states;
}

async function fetchHomeAssistantServices() {
    const haBase = buildHaBaseUrl();
    const haToken = process.env.HA_TOKEN || "";
    if (!haBase || !haToken) {
        throw new Error("Missing HA_BASE_URL(or HA_IP/HA_PORT) or HA_TOKEN in server .env");
    }

    const response = await fetch(`${haBase.replace(/\/$/, "")}/api/services`, {
        headers: {
            Authorization: `Bearer ${haToken}`,
            "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
        throw new Error(`Home Assistant services request failed: ${response.status}`);
    }
    const services = await response.json();
    if (!Array.isArray(services)) {
        throw new Error("Home Assistant services response was not an array");
    }
    return services;
}

async function fetchHomeAssistantAutomationConfig(id) {
    const haBase = buildHaBaseUrl();
    const haToken = process.env.HA_TOKEN || "";
    if (!haBase || !haToken) {
        throw new Error("Missing HA_BASE_URL(or HA_IP/HA_PORT) or HA_TOKEN in server .env");
    }
    const response = await fetch(`${haBase.replace(/\/$/, "")}/api/config/automation/config/${encodeURIComponent(id)}`, {
        headers: {
            Authorization: `Bearer ${haToken}`,
            "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Home Assistant automation config request failed: ${response.status}`);
    const config = await response.json();
    if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw new Error("Home Assistant automation config response was not an object");
    }
    return config;
}

async function mapLimit(items, limit, mapper) {
    const results = new Array(items.length);
    let index = 0;
    const workers = Array.from({ length: Math.max(1, limit) }, async () => {
        while (true) {
            const current = index++;
            if (current >= items.length) return;
            results[current] = await mapper(items[current]);
        }
    });
    await Promise.all(workers);
    return results;
}

/**
 * The live state list is authoritative for deletion and enabled/disabled
 * status. Config YAML is fetched only for live `on` automations and cached
 * briefly, so a disabled or deleted automation can never be selected.
 */
async function loadActiveAutomationCatalog() {
    const states = await fetchHomeAssistantStates();
    const active = states.filter(isActiveAutomationState);
    const now = Date.now();
    const entries = await mapLimit(active, AUTOMATION_CONFIG_CONCURRENCY, async (meta) => {
        const id = String(meta.attributes.id);
        const cached = cachedAutomationConfigs.get(id);
        let config;
        try {
            if (cached?.expires_at > now) config = cached.config;
            else {
                config = await fetchHomeAssistantAutomationConfig(id);
                cachedAutomationConfigs.set(id, { config, expires_at: Date.now() + AUTOMATION_CONFIG_CACHE_TTL_MS });
            }
        } catch {
            // A config that cannot be read is not safe to edit through the assistant.
            return null;
        }
        return catalogEntryFromConfig(meta, config);
    });
    const liveIds = new Set(active.map((state) => String(state.attributes.id)));
    for (const id of cachedAutomationConfigs.keys()) {
        if (!liveIds.has(id)) cachedAutomationConfigs.delete(id);
    }
    return entries.filter(Boolean);
}

function requestedAutomationOperation(body, context) {
    const requested = String(body?.automation_operation || context?.operation || "create").trim().toLowerCase();
    return ["create", "modify", "explain", "inspect"].includes(requested) ? requested : "create";
}

export function entityIdsInYaml(value) {
    const ids = new Set();
    const collect = (node) => {
        if (Array.isArray(node)) return node.forEach(collect);
        if (!node || typeof node !== "object") return;
        for (const [key, child] of Object.entries(node)) {
            if (key === "entity_id") {
                const values = Array.isArray(child) ? child : [child];
                for (const item of values) {
                    for (const id of String(item || "").split(",")) {
                        const normalized = id.trim();
                        if (/^[a-z_]+\.[a-z0-9_]+$/i.test(normalized)) ids.add(normalized);
                    }
                }
            }
            collect(child);
        }
    };
    try {
        // js-yaml is already used by the app's import path; parsing here only
        // extracts IDs and never executes YAML content.
        collect(yaml.load(String(value || ""), { schema: yaml.JSON_SCHEMA }));
    } catch {
        for (const match of String(value || "").matchAll(/\b[a-z_]+\.[a-z0-9_]+\b/gi)) ids.add(match[0]);
    }
    return ids;
}

async function loadHomeCapabilityContext() {
    const now = Date.now();
    const registryExpired = !cachedCapabilityRegistry || cachedCapabilityRegistry.expires_at <= now;
    // Entity state must remain live, but cold-start service discovery is
    // independent of it. Fetch both concurrently so the first assistant
    // request waits for the slower HA endpoint once rather than twice.
    const statesRequest = fetchHomeAssistantStates();
    const servicesRequest = registryExpired ? fetchHomeAssistantServices() : null;
    const [rawStates, services] = await Promise.all([statesRequest, servicesRequest]);
    const states = filterAssistantEntityStates(rawStates);
    if (registryExpired) {
        cachedCapabilityRegistry = {
            registry: createCapabilityRegistry({ serviceCatalog: services }),
            serviceCatalog: services,
            expires_at: Date.now() + CAPABILITY_CACHE_TTL_MS,
        };
    }
    const registry = cachedCapabilityRegistry.registry;
    return {
        entityCards: buildEntityCards(states, { registry }),
        capabilityContext: {
            ...publicCapabilityContext(registry),
            information_services: publicInformationServices(cachedCapabilityRegistry.serviceCatalog),
        },
        registry,
        serviceCatalog: cachedCapabilityRegistry.serviceCatalog,
    };
}

async function callHomeAssistantService({ service, entity_id, data = {} }) {
    const haBase = buildHaBaseUrl();
    const haToken = process.env.HA_TOKEN || "";
    if (!haBase || !haToken) {
        throw new Error("Missing HA_BASE_URL(or HA_IP/HA_PORT) or HA_TOKEN in server .env");
    }
    const [domain, serviceName, extra] = String(service || "").split(".");
    const entityIds = Array.isArray(entity_id) ? entity_id : [entity_id];
    if (!domain || !serviceName || extra || !entityIds.length
        || entityIds.some((id) => !String(id || "").startsWith(`${domain}.`))
        || !data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("Rejected malformed Home Assistant service request");
    }
    const response = await fetch(`${haBase.replace(/\/$/, "")}/api/services/${domain}/${serviceName}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${haToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...data, entity_id: entityIds.length === 1 ? entityIds[0] : entityIds }),
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
        throw new Error(`Home Assistant service request failed: ${response.status}`);
    }
}

const controlNow = createControlNowService({
    fetchCapabilityContext: loadHomeCapabilityContext,
    callService: callHomeAssistantService,
});

function informationInventory(cards) {
    const counts = new Map();
    for (const card of Array.isArray(cards) ? cards : []) {
        const domain = String(card?.domain || "").trim();
        if (domain) counts.set(domain, (counts.get(domain) || 0) + 1);
    }
    return [...counts.entries()]
        .map(([domain, count]) => ({ domain, count }))
        .sort((left, right) => left.domain.localeCompare(right.domain));
}

function defaultPersonEntity(cards) {
    const people = (Array.isArray(cards) ? cards : []).filter((card) => card?.domain === 'person');
    // A first-person reference is safe only when the home has one person
    // EntityCard. Otherwise the planner must ask for a specific person.
    return people.length === 1 ? people[0].entity_id : null;
}

async function queryHomeAssistantInformation({ plan }) {
    // Read current state at execution time rather than trusting the cached
    // retrieval context used by the provider.
    const { entityCards, serviceCatalog } = await loadHomeCapabilityContext();
    return executeInformationQuery(entityCards, plan, { serviceCatalog });
}

// Keep conversational references small, live, and independently verifiable.
// A client may suggest an ID, but it becomes context only when it still exists
// in the current Home Assistant EntityCard set.
function resolveInteractionContext(value, entityCards) {
    const supplied = value && typeof value === 'object' ? value.last_confirmed_target : null;
    const entityId = String(supplied?.entity_id || '').trim();
    const card = (Array.isArray(entityCards) ? entityCards : [])
        .find((candidate) => candidate.entity_id === entityId);
    if (!card) return { last_confirmed_target: null };
    return {
        last_confirmed_target: {
            entity_id: card.entity_id,
            source: String(supplied?.source || 'server_confirmed').trim() || 'server_confirmed',
        },
    };
}

function text(value) {
    return String(value ?? "").trim();
}

function hasResolvedBinding(entityResolution, entityId) {
    return Array.isArray(entityResolution) && entityResolution.some((entry) => (
        entry?.status === "resolved" && String(entry?.entity_id || "") === entityId
    ));
}

// A provider's selected entity is not enough grounding evidence when a natural
// language reference maps almost equally to multiple live EntityCards. This
// gate is installation-independent: it compares only live card embeddings and
// advertised capabilities, never a room/device alias dictionary.
async function assessEntityGrounding({ plan, entityCards, entityResolution }) {
    const target = plan?.target && typeof plan.target === "object" ? plan.target : {};
    const entityId = text(target.entity_id);
    const reference = text(plan?.user_reference);
    if (text(target.selector) !== "entity" || !entityId || !reference
        || text(target.context_source) === "last_confirmed_target"
        || hasResolvedBinding(entityResolution, entityId)) {
        return null;
    }
    const selected = entityCards.find((card) => card?.entity_id === entityId);
    if (!selected) return null;
    const service = text(plan?.effect?.service);
    const comparable = entityCards.filter((card) => (
        card?.domain === selected.domain
        && (!service || Array.isArray(card.supported_actions) && card.supported_actions.includes(service))
    ));
    if (comparable.length < 2) return null;
    try {
        const embedded = await providerNeutralAssistant.retrieveFastembed({
            query: reference,
            entityCards: comparable,
        });
        const ranking = Array.isArray(embedded?.ranking) ? embedded.ranking : [];
        const byId = new Map(comparable.map((card) => [card.entity_id, card]));
        const candidates = ranking
            .filter((entry) => byId.has(entry?.entity_id))
            .map((entry) => ({
                entity_id: entry.entity_id,
                score: Number(entry.score),
                card: byId.get(entry.entity_id),
            }))
            .filter((entry) => Number.isFinite(entry.score));
        const selectedIndex = candidates.findIndex((entry) => entry.entity_id === entityId);
        if (selectedIndex < 0 || !candidates.length) return null;
        const top = candidates[0];
        const runnerUp = candidates[1] || null;
        const margin = runnerUp ? top.score - runnerUp.score : Infinity;
        const ambiguous = selectedIndex !== 0 || margin < GROUNDING_MIN_MARGIN;
        return {
            status: ambiguous ? "ambiguous" : "grounded",
            reference,
            selected_entity_id: entityId,
            selected_rank: selectedIndex + 1,
            top_entity_id: top.entity_id,
            top_score: top.score,
            runner_up_score: runnerUp?.score ?? null,
            margin,
            minimum_margin: GROUNDING_MIN_MARGIN,
            candidates: candidates.slice(0, 8).map(({ card }) => ({
                entity_id: card.entity_id,
                name: card.friendly_name || card.entity_id,
                area: card.area || null,
                domain: card.domain,
                state: card.state ?? null,
            })),
        };
    } catch {
        // Retrieval unavailability must not create a fake confidence score.
        // The normal provider and live capability validation path remains
        // available, with the planner's own abstention instructions.
        return null;
    }
}

async function createDraftResponse(body = {}) {
    let automationContext = normalizeAutomationContext(body.automation_context);
    const automationOperation = requestedAutomationOperation(body, automationContext);
    const requestCommand = String(body.command || "");
    const suppliedCards = Array.isArray(body.entity_cards) ? body.entity_cards : null;
    const homeContextRequest = suppliedCards
        ? Promise.resolve({
            entityCards: suppliedCards,
            capabilityContext: { ...publicCapabilityContext(createCapabilityRegistry()), information_services: [] },
            serviceCatalog: [],
        })
        : loadHomeCapabilityContext();
    // An explicit selected context remains authoritative for generic edits
    // ("change the delay"). A uniquely named active HA automation can replace
    // it, which makes "edit Bedroom Climate" work without first loading it.
    const catalogRequest = automationOperation === "modify"
        ? loadActiveAutomationCatalog().catch(() => [])
        : Promise.resolve([]);
    const [homeContext, catalog] = await Promise.all([homeContextRequest, catalogRequest]);
    const catalogResolution = automationOperation === "modify"
        ? resolveAutomationReference(requestCommand, catalog)
        : { status: "no_match", candidates: [] };
    if (catalogResolution.status === "selected") {
        automationContext = normalizeAutomationContext({
            ...catalogResolution.candidate,
            operation: "modify",
        });
    }
    if (automationOperation === "modify" && !automationContext) {
        const candidates = catalogResolution.status === "ambiguous"
            ? catalogResolution.candidates
            : catalog;
        return {
            status: "needs_automation_selection",
            intent: "automation",
            role: "automation_reference",
            question: candidates.length
                ? "Select an active Home Assistant automation to edit."
                : "No active Home Assistant automation is available to edit.",
            candidates,
            validation: { schema_valid: false, grounded: false, blockly_supported: false },
            pipeline: { mode: "deterministic_automation_resolution", timings_ms: { total: 0 } },
        };
    }
    const plannerCommand = buildAutomationPlannerCommand(requestCommand, automationContext);
    const entityCards = homeContext.entityCards;
    const fullLiveEntityCards = homeContext.entityCards;
    const fullLiveEntityIds = new Set(fullLiveEntityCards.map((card) => card.entity_id));
    const interactionContext = resolveInteractionContext(body.interaction_context, entityCards);
    const inventory = informationInventory(entityCards);
    const rawEntityResolution = resolveExplicitEntityReferences(
        requestCommand, entityCards, body.slots,
    );
    // An automation title can match an existing `automation.*` entity. In a
    // create/modify request that text identifies the rule, not a device that
    // must be embedded in the generated YAML.
    const entityResolution = ["create", "modify"].includes(automationOperation)
        ? withoutAutomationRuleReferences(rawEntityResolution)
        : rawEntityResolution;
    const ambiguousReference = entityResolution.find((reference) => reference.status === "ambiguous");
    // A duplicate display name is a real ambiguity.  Resolve it before any
    // provider call, so a model cannot silently choose between devices.
    if (ambiguousReference) {
        return {
            status: "needs_confirmation",
            intent: "automation",
            role: "entity_reference",
            resolution_key: ambiguousReference.reference,
            question: `Which ${ambiguousReference.candidates[0]?.name || "entity"} did you mean?`,
            candidates: ambiguousReference.candidates,
            provider: "deterministic",
            model: "entity-resolution",
            validation: { schema_valid: false, grounded: false, blockly_supported: false },
            pipeline: { mode: "deterministic_entity_resolution", timings_ms: { total: 0 } },
        };
    }
    // Retrieval is deliberately outside the generation model.  It uses only
    // live EntityCards, so entity naming conventions are data rather than
    // per-home rules embedded in an LLM prompt.
    const retrievalMode = String(process.env.LLM_ENTITY_RETRIEVAL || "lexical").trim().toLowerCase();
    const retrieval = LLM_ASSISTANT_BACKEND === "provider_neutral"
        ? await retrieveEntityContext(requestCommand, entityCards, {
            mode: retrievalMode,
            maxCards: Number(process.env.LLM_ENTITY_CANDIDATE_LIMIT || 24),
            fastembed: retrievalMode === "fastembed_hybrid"
                ? ({ query, cards }) => providerNeutralAssistant.retrieveFastembed({
                    query,
                    entityCards: cards,
                })
                : undefined,
        })
        : null;
    const retrievedEntityCards = [...(retrieval?.cards || entityCards)];
    const retrievedIds = new Set(retrievedEntityCards.map((card) => card.entity_id));
    const entityById = new Map(entityCards.map((card) => [card.entity_id, card]));
    const unavailableBaseEntityIds = [...entityIdsInYaml(automationContext?.base_yaml)]
        .filter((entityId) => !fullLiveEntityIds.has(entityId));
    if (automationOperation === "modify" && unavailableBaseEntityIds.length) {
        return {
            status: "base_automation_entities_unavailable",
            intent: "automation",
            unavailable_entity_ids: unavailableBaseEntityIds,
            validation: {
                valid: false,
                schema_valid: true,
                grounded: false,
                blockly_supported: false,
                errors: unavailableBaseEntityIds.map((entityId) => (
                    `The selected automation references an unavailable Home Assistant entity: ${entityId}`
                )),
            },
            pipeline: { mode: "deterministic_base_automation_validation", timings_ms: { total: 0 } },
        };
    }
    // A deterministic binding is always part of the provider's validation
    // scope, even if a bounded retriever would otherwise omit it.
    for (const reference of entityResolution) {
        if (reference.status !== "resolved" || retrievedIds.has(reference.entity_id)) continue;
        const card = entityById.get(reference.entity_id);
        if (card) {
            retrievedEntityCards.push(card);
            retrievedIds.add(card.entity_id);
        }
    }
    // A modification must be allowed to preserve devices already present in
    // its selected YAML even when the short edit command does not repeat their
    // names. Only IDs that still exist in live HA are admitted.
    for (const entityId of entityIdsInYaml(automationContext?.base_yaml)) {
        if (retrievedIds.has(entityId)) continue;
        const card = entityById.get(entityId);
        if (card) {
            retrievedEntityCards.push(card);
            retrievedIds.add(entityId);
        }
    }
    // Entity-targeted services (such as notify.send_message) need their
    // live targets available even when the user says "my phone" rather than
    // the entity's display name. Reserve bounded notification recipients
    // without any per-home entity IDs or scenario-specific prompt rules.
    for (const card of entityCards.filter((item) => item.domain === 'notify').slice(0, 8)) {
        if (retrievedIds.has(card.entity_id)) continue;
        retrievedEntityCards.push(card);
        retrievedIds.add(card.entity_id);
    }
    // A verified unique Home Assistant person is the only safe first-person
    // binding; no entity ID or household member is inferred from the prompt.
    const personId = defaultPersonEntity(entityCards);
    if (personId && !retrievedIds.has(personId)) {
        const card = entityById.get(personId);
        if (card) {
            retrievedEntityCards.push(card);
            retrievedIds.add(personId);
        }
    }
    // A previously confirmed referent is not an alias or a guessed target.
    // Include it in the bounded evidence set so the provider can deliberately
    // reuse it for a target-omitted follow-up request.
    const contextualEntityId = interactionContext.last_confirmed_target?.entity_id;
    if (contextualEntityId && !retrievedIds.has(contextualEntityId)) {
        const card = entityById.get(contextualEntityId);
        if (card) {
            retrievedEntityCards.unshift(card);
            retrievedIds.add(card.entity_id);
        }
    }
    const result = LLM_ASSISTANT_BACKEND === "provider_neutral"
        ? await providerNeutralAssistant.createDraft({
            command: plannerCommand,
            conversation: body.conversation,
            provider: body.provider,
            entityCards: retrievedEntityCards,
            capabilityContext: homeContext.capabilityContext,
            entityResolution,
            slots: body.slots,
            interactionContext,
            defaultPersonEntity: defaultPersonEntity(entityCards),
            automationOperation,
            baseYaml: automationContext?.base_yaml || '',
            informationInventory: inventory,
            retrieval: retrieval && {
                method: retrieval.method,
                fallback: retrieval.fallback === true,
                embedding_model: retrieval.embedding_model || null,
                candidate_entity_ids: retrievedEntityCards.map((card) => card.entity_id),
                ranking: retrieval.ranking || [],
            },
        })
        : await createAutomationDraft({
            command: plannerCommand,
            conversation: body.conversation,
            selections: body.selections,
            interaction_mode: body.interaction_mode || "automation",
            entity_cards: entityCards,
            capability_context: homeContext.capabilityContext,
        });
    // Ollama's draft adapter predates the provider-neutral intent envelope.
    // Normalize a successful automation without changing its YAML contents.
    if (result?.automation && !result.intent) result.intent = 'automation';
    // Both LLM backends must pass the same trusted, live HA validation.
    // The planner's own flags cannot assert Blockly import or round-trip success.
    if ((result?.intent === 'automation' || (result?.intent === 'routine' && result?.plan?.operation === 'automation_generation')) && result?.automation) {
        const hostValidation = validateHostAutomation(
            // Retrieval is bounded for prompt quality; host grounding is not.
            // This full live HA list is the final authority for every entity.
            result.automation, fullLiveEntityCards, homeContext.registry || createCapabilityRegistry(),
        );
        const providerErrors = Array.isArray(result.validation?.errors) ? result.validation.errors : [];
        result.validation = {
            ...(result.validation || {}),
            ...hostValidation,
            valid: result.validation?.valid !== false && hostValidation.valid,
            host_valid: hostValidation.valid,
            errors: [...providerErrors, ...hostValidation.errors],
        };
        if (automationOperation === 'modify' && automationContext?.base_yaml) {
            const preservation = validateModificationPreservation({
                baseYaml: automationContext.base_yaml,
                automation: result.automation,
                command: requestCommand,
            });
            result.validation = {
                ...result.validation,
                valid: result.validation.valid && preservation.valid,
                preservation_valid: preservation.valid,
                errors: [...result.validation.errors, ...preservation.errors],
            };
        }
    }
    const groundingAssessment = LLM_ASSISTANT_BACKEND === "provider_neutral"
        ? await assessEntityGrounding({
            plan: result?.plan,
            entityCards,
            entityResolution,
        })
        : null;
    const pipeline = result?.pipeline || {};
    console.info("[llm-draft]", JSON.stringify({
        intent: result?.intent,
        plan_valid: result?.validation?.valid === true,
        generation_error: result?.generation_error || null,
        provider: result?.provider,
        mode: pipeline.mode || "llm",
        timings_ms: pipeline.timings_ms || null,
        retrieval: retrieval ? {
            method: retrieval.method,
            embedding_model: retrieval.embedding_model || null,
            candidate_count: retrievedEntityCards.length,
            fallback: retrieval.fallback === true,
            cache: retrieval.cache || null,
        } : null,
        ollama_calls: pipeline.ollama_calls || [],
    }));
    return {
        ...result,
        automation_operation: automationOperation,
        automation_context: automationContext ? {
            source: automationContext.source,
            title: automationContext.title,
            draft_id: automationContext.draft_id,
            automation_id: automationContext.automation_id,
            enabled: automationContext.enabled,
        } : null,
        _grounding_assessment: groundingAssessment,
        system: {
            pipeline_version: LLM_PIPELINE_VERSION,
            goal_prompt_version: GOAL_PROMPT_VERSION,
            draft_prompt_version: DRAFT_PROMPT_VERSION,
            backend: LLM_ASSISTANT_BACKEND,
        },
        context: {
            source: suppliedCards ? "request" : "live_ha",
            entity_count: entityCards.length,
            retrieved_entity_count: retrievedEntityCards.length,
            retrieval_method: retrieval?.method || null,
            resolved_entity_references: entityResolution.filter((reference) => reference.status === "resolved").length,
            service_count: homeContext.capabilityContext.services.length,
            capability_registry_version: homeContext.capabilityContext.registry_version,
        },
    };
}

const assistantRouter = createAssistantRequestRouter({
    createDraft: createDraftResponse,
    previewControl: (payload) => controlNow.preview(payload),
    executeControl: (payload) => controlNow.execute(payload),
    queryInformation: queryHomeAssistantInformation,
    // The draft already carries the user-visible result. A second provider
    // request only paraphrases that verified result and otherwise doubles
    // perceived latency. It remains opt-in for experiments that need it.
    createResponse: LLM_ASSISTANT_BACKEND === "provider_neutral"
        && String(process.env.LLM_ASSISTANT_NARRATION || "").toLowerCase() === "provider"
        ? (payload) => providerNeutralAssistant.createResponse(payload)
        : undefined,
});

app.get("/api/llm/status", (req, res) => {
    if (!guardLocal(req, res)) return;
    return res.json({
        status: "ready",
        provider: LLM_ASSISTANT_BACKEND === "provider_neutral"
            ? String(process.env.LLM_ASSISTANT_PROVIDER || "configured-default").toLowerCase()
            : String(process.env.LLM_PROVIDER || "fake").toLowerCase(),
        model: LLM_ASSISTANT_BACKEND === "provider_neutral"
            ? null
            : process.env.LLM_PROVIDER === "ollama"
            ? String(process.env.OLLAMA_MODEL || "qwen3:4b")
            : null,
        system: {
            pipeline_version: LLM_PIPELINE_VERSION,
            goal_prompt_version: GOAL_PROMPT_VERSION,
            draft_prompt_version: DRAFT_PROMPT_VERSION,
            backend: LLM_ASSISTANT_BACKEND,
        },
    });
});

app.get("/api/llm/providers", async (req, res) => {
    if (!guardLocal(req, res)) return;
    if (LLM_ASSISTANT_BACKEND !== "provider_neutral") {
        return res.json({ providers: [], default_provider: null, backend: LLM_ASSISTANT_BACKEND });
    }
    try {
        const catalog = await providerNeutralAssistant.getProviders();
        const requestedDefault = String(process.env.LLM_ASSISTANT_PROVIDER || "").trim().toLowerCase();
        const defaultProvider = catalog.providers.some((provider) => (
            provider.id === requestedDefault && provider.configured
        )) ? requestedDefault : catalog.default_provider;
        return res.json({ ...catalog, default_provider: defaultProvider, backend: LLM_ASSISTANT_BACKEND });
    } catch (error) {
        const status = error instanceof ProviderNeutralAssistantError ? error.statusCode : 500;
        return res.status(status).json({ error: "Provider status is unavailable." });
    }
});

app.post("/api/llm/automation/draft", async (req, res) => {
    if (!guardLocal(req, res)) return;

    try {
        return res.json(await createDraftResponse(req.body));
    } catch (error) {
        const message = String(error?.message || error);
        const status = error instanceof ProviderNeutralAssistantError
            ? error.statusCode
            : message.includes("Missing HA_") ? 503 : 500;
        return res.status(status).json({ status: "failure", error: message });
    }
});

app.post("/api/assistant/message", async (req, res) => {
    if (!guardLocal(req, res)) return;
    try {
        return res.json(await assistantRouter.handle(req.body));
    } catch (error) {
        const message = String(error?.message || error);
        const status = error instanceof ControlNowError
            ? error.statusCode
            : error instanceof ProviderNeutralAssistantError
                ? error.statusCode
            : message.includes("Missing HA_") ? 503 : 500;
        return res.status(status).json({
            status: "failure",
            code: error instanceof ControlNowError ? error.code : "assistant_request_failed",
            error: message,
        });
    }
});

app.post("/api/control-now/preview", async (req, res) => {
    if (!guardLocal(req, res)) return;
    try {
        return res.json(await controlNow.preview({
            service: req.body?.service,
            candidate_entity_ids: req.body?.candidate_entity_ids,
            selected_entity_id: req.body?.selected_entity_id,
        }));
    } catch (error) {
        const status = error instanceof ControlNowError
            ? error.statusCode
            : String(error?.message || "").includes("Missing HA_") ? 503 : 500;
        return res.status(status).json({
            status: "failure",
            code: error instanceof ControlNowError ? error.code : "control_preview_failed",
            error: String(error?.message || error),
        });
    }
});

app.post("/api/control-now/execute", async (req, res) => {
    if (!guardLocal(req, res)) return;
    try {
        return res.json(await controlNow.execute({ execution_id: req.body?.execution_id }));
    } catch (error) {
        const status = error instanceof ControlNowError
            ? error.statusCode
            : String(error?.message || "").includes("Missing HA_") ? 503 : 502;
        return res.status(status).json({
            status: "failure",
            code: error instanceof ControlNowError ? error.code : "ha_service_failed",
            error: String(error?.message || error),
        });
    }
});

app.post("/analyze", (req, res) => {
    if (!guardLocal(req, res)) return;
    const mode = req.body?.mode || "yaml";

    const haBase = buildHaBaseUrl();
    const haToken = process.env.HA_TOKEN || "";

    let args = [PY_PATH, "--out", "stdout"];

    if (mode === "ha") {
        if (!haBase || !haToken) {
            return res.status(500).json({ error: "Missing HA_BASE_URL(or HA_IP/HA_PORT) or HA_TOKEN in server .env" });
        }
        if (req.body?.draftYaml != null && (typeof req.body.draftYaml !== "string" || req.body.draftYaml.length > 100_000)) {
            return res.status(400).json({ error: "Invalid draftYaml (expected a single automation YAML up to 100000 characters)" });
        }
        if (req.body?.automationId != null && (typeof req.body.automationId !== "string" || req.body.automationId.length > 240)) {
            return res.status(400).json({ error: "Invalid automationId" });
        }
        args = [
            PY_PATH,
            "--ha",
            "--out",
            "stdout",
            "--concurrency",
            String(req.body?.concurrency ?? 8),
            ...(req.body?.automationId ? ["--replaced_automation_id", req.body.automationId] : []),
        ];
    } else {
        const yamlText = req.body?.yaml;
        if (!yamlText) return res.status(400).json({ error: "Missing body.yaml" });
    }

    const p = spawn(PY_CMD, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
            ...process.env,
            HA_BASE_URL: haBase,
            HA_TOKEN: haToken,
            PYTHONIOENCODING: "utf-8",
            PYTHONUTF8: "1",
        },
    });

    let out = "";
    let err = "";

    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));

    p.on("close", (code) => {
        if (code !== 0) {
            return res.status(500).json({ error: `python exited ${code}`, stderr: err, stdout: out });
        }
        try {
            const report = JSON.parse(out);
            return res.json({ report, stderr: err });
        } catch {
            return res.status(500).json({ error: "Failed to parse python stdout as JSON", stdout: out, stderr: err });
        }
    });

    if (mode !== "ha") {
        p.stdin.end(req.body.yaml);
    } else {
        // Optional unsaved draft is appended by Python after fetching the live
        // HA catalog. No draft is persisted or sent to HA.
        p.stdin.end(req.body?.draftYaml || "");
    }
});

app.listen(PORT, HOST, () => {
    console.log(`Analyzer server listening on http://${HOST}:${PORT}`);
});
