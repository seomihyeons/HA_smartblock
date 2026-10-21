import express from "express";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { normalizeAssistantPlan } from "./assistant_contract.mjs";
import { validateAutomationCandidate } from "./automation_validation.mjs";
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
    publicCapabilityContext,
} from "./capability_registry.mjs";
import { resolveExplicitEntityReferences, retrieveEntityContext } from "./entity_retriever.mjs";
import { executeInformationQuery } from "./information_query.mjs";



export function createAssistantApp({ env = process.env, fetchImpl = fetch, providerAssistant, draftGenerator = createAutomationDraft, validateAutomation = validateAutomationCandidate } = {}) {
const app = express();
app.use(express.json({ limit: "10mb" }));

const PY_PATH = path.resolve(
    __dirname,
    "../src/homeassistant/conflict_analyzer/ha_eca_conflict_analyzer.py"
);
const PY_CMD = env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const LLM_ASSISTANT_BACKEND = String(env.LLM_ASSISTANT_BACKEND || "provider_neutral").trim().toLowerCase();
const CAPABILITY_CACHE_TTL_MS = Math.max(5_000, Number(env.HA_CAPABILITY_CACHE_TTL_MS || "60000"));
const providerNeutralAssistant = providerAssistant || createProviderNeutralAssistantAdapter({ env });
let cachedCapabilityRegistry = null;
const GROUNDING_MIN_MARGIN = Math.max(0, Number(env.LLM_GROUNDING_MIN_MARGIN || "0.02"));

function buildHaBaseUrl() {
    if (env.HA_BASE_URL) return env.HA_BASE_URL.replace(/\/api\/?$/, "");
    const ip = env.HA_IP;
    const port = env.HA_PORT || "8123";
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
    const haToken = env.HA_TOKEN || "";
    if (!haBase || !haToken) {
        throw new Error("Missing HA_BASE_URL(or HA_IP/HA_PORT) or HA_TOKEN in server .env");
    }

    const response = await fetchImpl(`${haBase.replace(/\/$/, "")}/api/states`, {
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
    const haToken = env.HA_TOKEN || "";
    if (!haBase || !haToken) {
        throw new Error("Missing HA_BASE_URL(or HA_IP/HA_PORT) or HA_TOKEN in server .env");
    }

    const response = await fetchImpl(`${haBase.replace(/\/$/, "")}/api/services`, {
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

async function loadHomeCapabilityContext({ freshServices = false } = {}) {
    const states = await fetchHomeAssistantStates();
    const now = Date.now();
    if (freshServices || !cachedCapabilityRegistry || cachedCapabilityRegistry.expires_at <= now) {
        const services = await fetchHomeAssistantServices();
        cachedCapabilityRegistry = {
            registry: createCapabilityRegistry({ serviceCatalog: services }),
            expires_at: now + CAPABILITY_CACHE_TTL_MS,
        };
    }
    const registry = cachedCapabilityRegistry.registry;
    return {
        entityCards: buildEntityCards(states, { registry }),
        capabilityContext: publicCapabilityContext(registry),
        registry,
    };
}

async function callHomeAssistantService({ service, entity_id, data = {} }) {
    const haBase = buildHaBaseUrl();
    const haToken = env.HA_TOKEN || "";
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
    const response = await fetchImpl(`${haBase.replace(/\/$/, "")}/api/services/${domain}/${serviceName}`, {
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

async function queryHomeAssistantInformation({ plan }) {
    // Read current state at execution time rather than trusting the cached
    // retrieval context used by the provider.
    const { entityCards } = await loadHomeCapabilityContext();
    return executeInformationQuery(entityCards, plan);
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
    const suppliedCards = Array.isArray(body.entity_cards) ? body.entity_cards : null;
    const homeContext = suppliedCards
        ? {
            entityCards: suppliedCards,
            capabilityContext: publicCapabilityContext(createCapabilityRegistry()),
        }
        : await loadHomeCapabilityContext();
    const entityCards = homeContext.entityCards;
    const interactionContext = resolveInteractionContext(body.interaction_context, entityCards);
    const inventory = informationInventory(entityCards);
    const entityResolution = resolveExplicitEntityReferences(
        String(body.command || ""), entityCards, body.slots,
    );
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
    const retrievalMode = String(env.LLM_ENTITY_RETRIEVAL || "lexical").trim().toLowerCase();
    const retrieval = LLM_ASSISTANT_BACKEND === "provider_neutral"
        ? await retrieveEntityContext(String(body.command || ""), entityCards, {
            mode: retrievalMode,
            maxCards: Number(env.LLM_ENTITY_CANDIDATE_LIMIT || 24),
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
    let result = LLM_ASSISTANT_BACKEND === "provider_neutral"
        ? await providerNeutralAssistant.createDraft({
            command: body.command,
            conversation: body.conversation,
            provider: body.provider,
            entityCards: retrievedEntityCards,
            capabilityContext: homeContext.capabilityContext,
            entityResolution,
            slots: body.slots,
            interactionContext,
            informationInventory: inventory,
            retrieval: retrieval && {
                method: retrieval.method,
                fallback: retrieval.fallback === true,
                embedding_model: retrieval.embedding_model || null,
                candidate_entity_ids: retrievedEntityCards.map((card) => card.entity_id),
                ranking: retrieval.ranking || [],
            },
        })
        : await draftGenerator({
            command: body.command,
            conversation: body.conversation,
            selections: body.selections,
            interaction_mode: body.interaction_mode || "automation",
            entity_cards: entityCards,
            capability_context: homeContext.capabilityContext,
        }, { env: { ...env, LLM_PROVIDER: env.LLM_PROVIDER || 'ollama' }, fetchImpl });
    result = normalizeAssistantPlan(result, body, entityCards);
    if (result.intent === 'automation' && result.automation && result.validation?.valid) {
        const validation = validateAutomation(result.automation, entityCards, homeContext.registry || createCapabilityRegistry());
        result = { ...result, validation: { ...result.validation, ...validation } };
        if (validation.valid) result.normalized_yaml = validation.regenerated_yaml;
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
    createResponse: LLM_ASSISTANT_BACKEND === "provider_neutral"
        ? (payload) => providerNeutralAssistant.createResponse(payload)
        : undefined,
});

app.get("/api/llm/status", (req, res) => {
    if (!guardLocal(req, res)) return;
    return res.json({
        status: "configured",
        readiness_verified: false,
        provider: LLM_ASSISTANT_BACKEND === "provider_neutral"
            ? String(env.LLM_ASSISTANT_PROVIDER || "configured-default").toLowerCase()
            : String(env.LLM_PROVIDER || "fake").toLowerCase(),
        model: LLM_ASSISTANT_BACKEND === "provider_neutral"
            ? null
            : env.LLM_PROVIDER === "ollama"
            ? String(env.OLLAMA_MODEL || "qwen3:4b")
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
        return res.json({ providers: [{ id: "ollama", label: "Ollama (legacy planner)", configured: true }], default_provider: "ollama", backend: LLM_ASSISTANT_BACKEND });
    }
    try {
        const catalog = await providerNeutralAssistant.getProviders();
        const requestedDefault = String(env.LLM_ASSISTANT_PROVIDER || "").trim().toLowerCase();
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
            target: req.body?.target,
            data: req.body?.data,
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
        return res.json(await assistantRouter.execute({ ...req.body, execution_id: req.body?.execution_id, confirmed: req.body?.confirmed === true }));
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
    const haToken = env.HA_TOKEN || "";

    let args = [PY_PATH, "--out", "stdout"];

    if (mode === "ha") {
        if (!haBase || !haToken) {
            return res.status(500).json({ error: "Missing HA_BASE_URL(or HA_IP/HA_PORT) or HA_TOKEN in server .env" });
        }
        args = [
            PY_PATH,
            "--ha",
            "--out",
            "stdout",
            "--concurrency",
            String(req.body?.concurrency ?? 8),
        ];
    } else {
        const yamlText = req.body?.yaml;
        if (!yamlText) return res.status(400).json({ error: "Missing body.yaml" });
    }

    const p = spawn(PY_CMD, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
            ...env,
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
        p.stdin.write(req.body.yaml);
        p.stdin.end();
    } else {
        p.stdin.end();
    }
});


return app;
}
