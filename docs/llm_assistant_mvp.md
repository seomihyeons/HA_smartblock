# HA-SmartBlock LLM research assistant

This branch is `research/llm-agent`, based on main commit `d1bf5ae748b76c54ea8c3fa4cc4fc09f0213bbb7` (PR #28). It selectively integrates the two former LLM branches and source-only local research changes. Main's runtime entity loading, study filtering, block search, YAML importer/generator, Dynamic/Raw blocks and existing regression tests are retained.

## Architecture

```
Browser Assistant -> Node /api/assistant/message
  -> fresh HA states + shared Blockly/service capability registry
  -> EntityCards + explicit bindings + bounded lexical/hybrid retrieval
  -> Python /v1/assistant -> selected provider -> intent/plan
  -> host validation and routing:
     automation -> recursive grounding + actual headless Blockly round-trip
                -> user imports blocks -> optional conflict analysis
                -> separate existing Push to HA
     control    -> live target/service/data/risk checks -> immutable preview
                -> explicit Execute -> fresh revalidation -> HA service call
                -> request acceptance + separate observed-state verification
     information -> fresh HA states -> deterministic property/filter/count
                 -> provider response from tool facts (template fallback)
```

The shared Python planner supports Ollama, ChatGPT, Claude, Gemini and Grok through the same host contract. Generative interpretation never calls HA directly. `server/assistant_contract.mjs` also adapts the retained legacy Node Ollama pipeline for compatibility. Legacy model benchmarks are separate from the new planner; their results are not evidence about the unified assistant.

## Main modules

- `server/assistant_api.mjs`: injectable Express app; credentials and HA calls remain at this host boundary. Importing it starts no server.
- `server/analyze_server.js`: local server entry point, default loopback port 8787.
- `ha_llm_control/llm_assistant/api_server.py`: loopback Python service on port 8792; planning, final responses, optional FastEmbed retrieval.
- `assistant_request_router.mjs`: server-owned resolution outcomes. `handle()` can only produce control previews; `execute()` is a separate explicit-confirmation operation.
- `control_now_service.mjs`: one-use, 60-second preview tokens bound to immutable service/targets/data. Medium/high-risk and targetless services remain draft-only. Empty live service catalogs fail closed.
- `automation_validation.mjs`: validates actual main Blockly import and generation in a temporary workspace, restores the process-local entity context and compares both semantics and preserved fields.
- `information_query.mjs`, `target_selector.mjs`: read-only state/attribute/list/count operations against current EntityCards.
- `provider_neutral_assistant_adapter.mjs`: Node/Python contract; no provider credentials are exposed to the browser.
- `entity_retriever.mjs`, `embedding.py`: explicit-name resolution, lexical ranking, Ollama or FastEmbed hybrid RRF, and lexical fallback.

## Local setup

Use Node 22+ and Python 3.10+. Install from a fresh checkout:

```powershell
npm ci
python -m pip install -r ha_llm_control/requirements.txt
# Optional FastEmbed; core operation does not require an embedding download:
python -m pip install -r ha_llm_control/requirements-fastembed.txt
```

Copy `.env.example` to a local `.env`, configure HA and the desired provider, and keep credentials out of Git. Python reads the same root `.env`; the former `ha_llm_control/llm_api/.env` remains a fallback. Ollama requires a separately running Ollama server and a locally available model. Provider configuration flags describe configured selection, not verified model availability.

Start these processes in separate terminals:

```powershell
python -B -m ha_llm_control.llm_assistant.api_server
npm run server
npm start
```

The existing main UI obtains `/api/entities` from the add-on configured by `SMARTBLOCK_ADDON_URL`. Start a compatible add-on for the runtime selectors; the assistant does not replace main's study bootstrap with bundled fixture entities. Missing HA data leaves selectors empty under main's existing policy.

Default `LLM_ASSISTANT_BACKEND=provider_neutral` supports all five providers. `LLM_ASSISTANT_BACKEND=ollama` retains the former two-stage Node planner for automation/control compatibility; it is not the full information-query planner. Select `lexical`, `ollama_hybrid` or `fastembed_hybrid` through `LLM_ENTITY_RETRIEVAL`.

## Execution and validation contract

- `/api/assistant/message` never executes a service, including when the request contains `confirmed: true`.
- A control response has `resolution.status=needs_confirmation` and `control_preview` listing exact entity IDs, service, data and risk.
- Only the separate `/api/control-now/execute` request with the issued token and `confirmed: true` can execute. The UI sends it only from the Execute button. Tokens expire after 60 seconds and cannot be reused.
- Target existence, live service availability, compatibility, risk and service fields are checked again at Execute. Risk is a conservative domain/service policy, not a complete physical-device safety model.
- `request_status=accepted` reports an HTTP-accepted HA request. `verification.status=confirmed` means the expected HA state was subsequently observed. It does not prove a physical effect. Unmapped or data-bearing actions remain unconfirmed by the current observer.
- Python validation is not a Blockly support certificate. Node performs recursive checks and imports/regenerates every accepted automation through the actual main code. `blockly_supported` means no Raw blocks were needed; `blockly_preserved`/`roundtrip_verified` describe preservation. Drafts with changed/dropped fields are rejected.
- Automation saving is exclusively the separate existing Push to HA action. Conflict analysis is optional and does not authorize saving or execution.

## Add-on packaging

The research image combines current root sources with the add-on runtime. Do not build this branch from the old duplicated `ha_smartblock/src` directory.

```powershell
npm run prepare:addon -- C:/temp/ha-smartblock-research-context
# The destination must be new; preparation never removes an existing directory.
docker build -t ha-smartblock-llm-agent:research C:/temp/ha-smartblock-research-context
```

The core image supports the Ollama transport without cloud SDKs. For a cloud-provider image, add `--build-arg INSTALL_CLOUD_PROVIDERS=true`; this optional SDK image variant has not been validated by the local integration run. FastEmbed is optional and is not installed in the core image; a missing model/dependency falls back to lexical retrieval.

`run.sh` supervises Python 8792, the Node assistant 8787 and the existing add-on server 8099. The add-on proxies Assistant APIs to the loopback worker and retains its existing entity, HA proxy, analyzer and baseline endpoints. The evaluation-image workflow prepares this root-source context. No image is published by the LLM test workflow.

## Offline verification

```powershell
npm test
npm run test:python
npm run test:roundtrip
npm run build
```

All model/service behavior in these tests is injected or mocked. HTTP tests cover Node routes and the add-on proxy; DOM tests exercise the actual Assistant UI including explicit Execute. Python tests cover provider-neutral orchestration, recursive validation, mocked Ollama and cached embedding behavior. No test in these suites needs HA credentials, an installed Ollama model or a live provider.

`npm run test:corpus -- --output=<report.json>` runs the existing Regression Test function headlessly over the public YAML corpus with synthetic dropdown entities. `--baseline=<report.json>` reports only new regressions relative to a run in the same context. Existing main study filters still apply; this context is not a connected real-home conversion experiment. Store generated reports outside the repository.

## Current limits and research claims

The prototype implements natural-language automation planning, explicit-confirmation control and request-time state/attribute/list/count queries. It retains visual editing and optional conflict analysis. Live model correctness, physical-device operation, latency and HA automation saving have not been verified by the integration tests. Do not describe request-time REST reads as continuous real-time monitoring.

Area registry joins, full HA syntax coverage, unrestricted multi-step routines, factuality checks on generated final prose, and generic attribute-effect verification remain future work. Final-response failures use deterministic factual templates; successful model-generated prose is prompted to use tool facts but is not formally checked. No performance, multilingual accuracy, safety guarantee or usability improvement is established by mock tests.

The retained Gemini SDK currently emits an end-of-support warning. Dependency installation/imports were checked in a fresh venv, but migration to `google.genai` and live provider compatibility remain follow-up work.
