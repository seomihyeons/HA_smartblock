import express from "express";
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
    createCapabilityRegistry,
    publicCapabilityContext,
} from "./capability_registry.mjs";

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

async function loadHomeCapabilityContext() {
    const [states, services] = await Promise.all([
        fetchHomeAssistantStates(),
        fetchHomeAssistantServices(),
    ]);
    const registry = createCapabilityRegistry({ serviceCatalog: services });
    return {
        entityCards: buildEntityCards(states, { registry }),
        capabilityContext: publicCapabilityContext(registry),
        registry,
    };
}

async function callHomeAssistantService({ service, entity_id }) {
    const haBase = buildHaBaseUrl();
    const haToken = process.env.HA_TOKEN || "";
    if (!haBase || !haToken) {
        throw new Error("Missing HA_BASE_URL(or HA_IP/HA_PORT) or HA_TOKEN in server .env");
    }
    const [domain, serviceName, extra] = String(service || "").split(".");
    if (!domain || !serviceName || extra || !String(entity_id || "").startsWith(`${domain}.`)) {
        throw new Error("Rejected malformed Home Assistant service request");
    }
    const response = await fetch(`${haBase.replace(/\/$/, "")}/api/services/${domain}/${serviceName}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${haToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ entity_id }),
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

async function createDraftResponse(body = {}) {
    const suppliedCards = Array.isArray(body.entity_cards) ? body.entity_cards : null;
    const homeContext = suppliedCards
        ? {
            entityCards: suppliedCards,
            capabilityContext: publicCapabilityContext(createCapabilityRegistry()),
        }
        : await loadHomeCapabilityContext();
    const entityCards = homeContext.entityCards;
    const result = await createAutomationDraft({
        command: body.command,
        conversation: body.conversation,
        selections: body.selections,
        interaction_mode: body.interaction_mode || "automation",
        entity_cards: entityCards,
        capability_context: homeContext.capabilityContext,
    });
    const pipeline = result?.pipeline || {};
    console.info("[llm-draft]", JSON.stringify({
        status: result?.status,
        provider: result?.provider,
        mode: pipeline.mode || "llm",
        timings_ms: pipeline.timings_ms || null,
        ollama_calls: pipeline.ollama_calls || [],
    }));
    return {
        ...result,
        system: {
            pipeline_version: LLM_PIPELINE_VERSION,
            goal_prompt_version: GOAL_PROMPT_VERSION,
            draft_prompt_version: DRAFT_PROMPT_VERSION,
        },
        context: {
            source: suppliedCards ? "request" : "live_ha",
            entity_count: entityCards.length,
            service_count: homeContext.capabilityContext.services.length,
            capability_registry_version: homeContext.capabilityContext.registry_version,
        },
    };
}

const assistantRouter = createAssistantRequestRouter({
    createDraft: createDraftResponse,
    previewControl: (payload) => controlNow.preview(payload),
});

app.get("/api/llm/status", (req, res) => {
    if (!guardLocal(req, res)) return;
    return res.json({
        status: "ready",
        provider: String(process.env.LLM_PROVIDER || "fake").toLowerCase(),
        model: process.env.LLM_PROVIDER === "ollama"
            ? String(process.env.OLLAMA_MODEL || "qwen3:4b")
            : null,
        system: {
            pipeline_version: LLM_PIPELINE_VERSION,
            goal_prompt_version: GOAL_PROMPT_VERSION,
            draft_prompt_version: DRAFT_PROMPT_VERSION,
        },
    });
});

app.post("/api/llm/automation/draft", async (req, res) => {
    if (!guardLocal(req, res)) return;

    try {
        return res.json(await createDraftResponse(req.body));
    } catch (error) {
        const message = String(error?.message || error);
        const status = message.includes("Missing HA_") ? 503 : 500;
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
        p.stdin.write(req.body.yaml);
        p.stdin.end();
    } else {
        p.stdin.end();
    }
});

app.listen(PORT, HOST, () => {
    console.log(`Analyzer server listening on http://${HOST}:${PORT}`);
});
