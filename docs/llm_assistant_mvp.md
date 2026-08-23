# AI Automation Assistant MVP

This branch contains the first reviewable vertical slice for the competition feature.

## Current flow

1. Open the `🗨︎` floating button.
2. Enter a motion-to-light automation request.
3. The analyzer server reads the current Home Assistant states.
4. Ollama first classifies the goal, task type, trigger evidence, requested service, and home feasibility.
5. Low-risk abstract requests produce a conservative manual-run draft with visible assumptions.
6. Only a material ambiguity that cannot be resolved from context stops at one clarification question.
7. Only a ready goal is passed to the structured automation planner.
8. The server validates schema, entity grounding, advertised services, Blockly capability, and semantic alignment.
9. The user explicitly imports the validated draft into Blockly.
10. The optional conflict action compares the draft with editable, enabled Home Assistant automations.

The MVP does not save an automation or call a Home Assistant action. Home Assistant access in this flow is read-only.

## Supported request shape

The deterministic fake provider intentionally supports one narrow scenario:

```text
motion state trigger -> light.turn_on action
```

Example:

```text
현관 움직임이 감지되면 거실 무드램프를 켜줘
```

The Ollama research pipeline currently supports at most one state trigger, or a trigger-free manual draft, followed by exactly one `light.turn_on` or `light.turn_off` action. One action may target multiple grounded entities. The assistant context already establishes that the output is an automation draft, so it does not ask whether the user wanted immediate control. Missing triggers become manual-run drafts. Low-risk inferred actions are shown as assumptions, while genuinely blocking ambiguity produces at most one question per turn.

For a low-risk inferred `light.turn_off` goal, the LLM classifies the goal and primary service, while deterministic policy code constructs the grounded draft. It prefers lights currently on; if none are on, it creates a reusable all-supported-lights draft and records that assumption. This path skips the second planning-model call.

Ambiguous entity candidates produce a confirmation response. Requests outside the supported trigger/action syntax produce an `unsupported` response. Both goal-analysis and draft responses are validated locally with JSON Schema rather than trusting Ollama's response-format constraint. Explicit/inferred action consistency, exact evidence spans, target hints, entity grounding, advertised services, Blockly capability, and analyzed intent are checked before a draft is shown. Each model stage permits at most one repair attempt.

The current research artifact versions are `pipeline 0.3.2`, `goal prompt 2026-08-16.2`, and `draft prompt 2026-08-16.1`. Every API response includes these values under `system` so that a running server can be distinguished from stale code.

Pipeline 0.3.2 also repairs explicit state-trigger metadata deterministically when the request contains both a conditional phrase and a known EntityCard. This does not select a new entity or bypass planning validation; it prevents a small model's inconsistent `trigger_specified`, `trigger_kind`, and evidence fields from rejecting an otherwise explicit request. Inferred target IDs are retained only when the corresponding EntityCard is mentioned in the request.

The running configuration can be checked without invoking a model:

```text
GET /api/llm/status
```

## Research pipeline boundary

The implemented stages adapt the public Sasha/SAGE design ideas without copying their runtime:

```text
Goal analysis and feasibility
  -> clarification when incomplete
  -> grounded capability context
  -> structured planning
  -> deterministic semantic feedback
  -> Blockly preview and conflict analysis
```

This is not yet a full Sasha or SAGE reproduction. Entity/device/area registry joins, embedding retrieval, broader Home Assistant syntax, benchmark scoring, and execution/postcondition verification remain separate work. The application remains preview-only and never calls a Home Assistant service from the assistant flow.

## Run locally

Start the analyzer and draft API:

```powershell
node server\analyze_server.js
```

Start the web application in a second terminal:

```powershell
npm start
```

The root `.env` must contain the existing Home Assistant connection settings used by the project. Tokens are never included in the draft prompt or response.

The deterministic provider remains the default:

```dotenv
LLM_PROVIDER=fake
```

To use a local Ollama model:

```powershell
ollama pull qwen3:4b-q4_K_M
```

```dotenv
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b-q4_K_M
OLLAMA_THINK=false
OLLAMA_SEED=42
OLLAMA_KEEP_ALIVE=30m
LLM_REQUEST_TIMEOUT_MS=120000
LLM_MAX_ENTITY_CARDS=32
```

The server calls Ollama's local `/api/chat` endpoint with `temperature: 0` and a JSON Schema response format. It sends only the natural-language request, an optional entity selection, compact EntityCards, and the supported service list.

## Verify

```powershell
npm run test:llm
npm run build
npm audit --omit=dev
```

## Deliberately not implemented yet

- entity/device/area registry joins
- embedding retrieval
- OpenAI or another hosted model provider
- automation save or activation
- direct device control
- add-on source parity

These are staged after review of the interaction and Blockly import behavior.
