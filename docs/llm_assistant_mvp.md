# Capability-driven AI Automation Assistant

## Scope

The assistant is a guarded natural-language interface over HA-SmartBlock's existing visual automation capabilities. It is not a general Home Assistant agent and does not claim support for every Home Assistant syntax form.

The capability boundary is derived from one registry built from `src/data/options.js`, the normalized automation IR, Blockly-native trigger/condition/action structures, and the live Home Assistant `/api/services` catalog. A semantic category such as `lighting`, `sleep_preparation`, or `security` is descriptive metadata only; it never grants syntax support or execution permission.

Pipeline version: `0.4.0`.

## Why this architecture

An LLM is useful for mapping multilingual and paraphrased requests to intent, but it must not be the authority for device existence, service support, risk, or execution. The system therefore separates probabilistic interpretation from deterministic enforcement:

```text
User message (Korean or English)
  -> live HA states + services
  -> EntityCard construction + capability registry
  -> lexical or hybrid entity retrieval
  -> LLM goal analysis (structured JSON)
  -> local evidence, capability, grounding, compatibility, and risk checks
  -> branch
       automation_creation -> LLM IR planning -> schema/grounding/semantic checks
                           -> user imports blocks -> optional Push to HA
       immediate_control   -> low-risk policy -> preview -> explicit Execute
                           -> live revalidation -> one-time HA service call
```

This follows Home Assistant's own separation of triggers, conditions, and actions and uses the documented REST endpoints for states, services, and service calls:

- [Home Assistant automation basics](https://www.home-assistant.io/docs/automation/basics/)
- [Home Assistant REST API](https://developers.home-assistant.io/docs/api/rest/)

## EntityCard and retrieval

An EntityCard is this project's compact, allowlisted representation of a Home Assistant entity. It contains the entity ID, display name, domain, state, device class, area when available, safe capability attributes, and services derived from the registry. Arbitrary attributes and credentials are not copied.

The retrieval interface supports two modes:

- `lexical`: deterministic field matching with inverse-document-frequency weighting; no extra model is needed.
- `hybrid`: lexical ranking plus multilingual embedding similarity, fused with Reciprocal Rank Fusion (RRF). If embeddings fail or the model is absent, it falls back to lexical ranking instead of failing the assistant request.

There is no Korean-to-English room dictionary or list of domain-specific room names. Hybrid retrieval is designed to handle requests such as Korean text against English Home Assistant entity names. The optional local embedding model is `qwen3-embedding:0.6b` through Ollama. RRF is used because lexical and cosine scores are on unrelated scales; it combines rank positions rather than pretending their raw scores are comparable.

References:

- [Qwen3 Embedding](https://github.com/QwenLM/Qwen3-Embedding)
- [Ollama qwen3-embedding](https://ollama.com/library/qwen3-embedding)
- [Reciprocal Rank Fusion](https://cormack.uwaterloo.ca/cormacksigir09-rrf.pdf)

## Capability and category rules

The supported service list is produced from Blockly's domain specification and intersected with the live Home Assistant service catalog. The same registry supplies:

- native visual trigger, condition, and action-structure support;
- entity/service domain compatibility;
- whether an entity target is required;
- low, medium, or high risk;
- whether immediate execution is permitted after confirmation or is draft-only.

Adding a service to the shared visual domain specification therefore makes it visible to EntityCard generation, prompting, validation, and risk policy through one capability path. A new Blockly structure still requires an importer/generator implementation and explicit registration; the LLM cannot invent that support.

`goal_category` is free descriptive text used for reporting and research analysis. Support decisions use exact trigger kinds, condition kinds, action structures, service IDs, entity IDs, and risk metadata. This avoids the previous failure where a request could be rejected merely because a small model assigned the wrong broad category.

## LLM calls

Normal automation creation uses two structured calls:

1. goal analysis: intent type, evidence spans, requested services, targets, ambiguity, and assumptions;
2. automation planning: normalized Home Assistant automation IR.

Each stage allows at most one repair call if local schema validation fails, so the worst case is four chat calls. A direct immediate-control request uses only goal analysis, then deterministic preview and execution policy; it does not call the planning model. Hybrid retrieval additionally calls the local embedding endpoint, which is not a generative LLM call.

Both model stages use `temperature: 0`, a fixed seed, JSON Schema response formatting, and local validation. Korean and English are accepted as user input; the system prompts and schema terminology remain English for reproducibility.

## Safety boundary

- Entity IDs must exist in the supplied EntityCards.
- Service IDs must exist in the live capability context.
- Target domains must be compatible with the service.
- Explicit evidence must be copied from the user's message.
- Vague action wording is clarified instead of mapped to an arbitrary service.
- Inferred actions must be low risk and list their assumptions.
- Medium/high-risk immediate requests are draft-only.
- Immediate execution always requires a visible preview and an explicit `Execute` click.
- Preview tokens are single-use, expire after 60 seconds, and are stored only in server memory.
- The server fetches current capabilities again immediately before execution.
- Automation drafts are not saved until the user separately chooses `Push to HA`.

## Current native visual scope

The registry currently advertises the Blockly-native structures already present in this repository:

- triggers: state, numeric state, time, time pattern, sun, Home Assistant lifecycle, event, MQTT, template;
- conditions: state, numeric state, time, sun, template, and/or/not;
- action structures: service call, delay, choose;
- services: domains and methods declared by the shared Blockly domain specification and available in the connected Home Assistant instance.

Unknown YAML remains preservable through raw blocks, but raw preservation is not presented to the LLM as native visual editability.

## Run

```powershell
node server\analyze_server.js
```

In a second terminal:

```powershell
npm start
```

Recommended local configuration:

```dotenv
LLM_PROVIDER=ollama
OLLAMA_MODEL=qwen3:4b-q4_K_M
OLLAMA_THINK=false
OLLAMA_SEED=42
LLM_ENTITY_RETRIEVAL=lexical
```

For multilingual hybrid retrieval:

```powershell
ollama pull qwen3-embedding:0.6b
```

```dotenv
LLM_ENTITY_RETRIEVAL=hybrid
OLLAMA_EMBED_MODEL=qwen3-embedding:0.6b
```

## Known limitations

- Area information is used when present, but a complete entity/device/area-registry join is not implemented yet.
- Immediate execution currently sends only an entity target and no arbitrary service data.
- Medium/high-risk services remain draft-only even when Home Assistant exposes them.
- Lexical retrieval alone cannot reliably bridge unrelated Korean and English names; hybrid mode is intended for that case.
- The existing 861-case YAML/Blockly corpus measures conversion compatibility, not full natural-language intent coverage. A separate multi-domain LLM evaluation set is still required.
- The deterministic `fake` provider remains only as a narrow test fixture; the competition assistant uses Ollama.
- On the tested Intel Core i5-1340P CPU-only Windows host, one live Korean automation request took 175.3 seconds end-to-end even after context retrieval. The output was correct and required no repair, but this latency is not yet an acceptable interactive target.

## Live verification record

The capability-driven pipeline was checked non-destructively against the connected Home Assistant instance on 2026-08-25:

- 90 states and 42 service domains loaded successfully;
- Korean request with English entity names retrieved `binary_sensor.pir_entrance` and `light.livingroom_light` through hybrid retrieval;
- generated result: state trigger -> `light.turn_on` -> `light.livingroom_light`;
- local validation errors: 0;
- generative calls: 2, repairs: 0;
- total latency: 175,298 ms;
- no automation save, Home Assistant service call, or device execution was performed.

## Verification

```powershell
npm test
npm run build
npm audit --omit=dev
```
