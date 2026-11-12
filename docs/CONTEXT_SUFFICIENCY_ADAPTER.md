# Context Sufficiency Adapter (Phase 03 — Shadow)

`server/context_sufficiency_adapter.mjs` adapts the existing host values to the contract in `context_sufficiency.mjs` without running another LLM or calling Home Assistant.

## Input mapping

- `fullEntityCards` -> `context.entity_cards`: all filtered and area-enriched live HA EntityCards from `loadHomeCapabilityContext()`.
- `retrievedEntityCards` -> `context.retrieved_entity_ids`: exactly the candidates passed to the first LLM call, **after** explicit references, selected YAML entities, notification targets, and confirmed conversational target are added.
- `entityResolution` -> `requirements.entities` (resolved explicit IDs only) and `context.entity_resolution` (including ambiguity); the host resolver does not prove total semantic coverage.
- `plannerCatalog.entries` -> `context.automation_catalog`: only `source: home_assistant` with consistent `automation_id`/`id`, including cached `base_yaml` only inside the host. Recent draft/workspace IDs are separate namespaces.
- `provided_automation_ids: []`: the initial LLM receives summaries only, not cached YAML.
- `requirements.source: provisional`, `requirements.complete: false`: **always** until an independent trusted intent-verification mechanism is added.

## Shadow activation

Locally set `LLM_CONTEXT_SUFFICIENCY_SHADOW=1` in the Node backend `.env` and restart the server. Use existing `/api/assistant/message` or `/api/llm/automation/draft` to run normal requests. The server prints `[context-sufficiency-shadow]` with aggregate status/code counts. For normal finished drafts, the same aggregate is included at `pipeline.context_sufficiency_shadow`. Disable by removing the variable or setting it to `0`.

Shadow mode is **off by default** and must not change existing One-Call / modification routing, HA reads, validation, results or controls. It neither schedules nor executes the proposed tools.

Logs deliberately contain no raw command, YAML, entity ID, state, personal data or token. Run tests and keep experiment logs only on local ignored paths.

## Interpretation and limitations

Even when all explicit Entity references are present, the adapter correctly emits `requirements_verified: false`, usually `status: insufficient` and `next_action: existing_planner`. That is **not evidence the original One-Call request fails**: we have not yet verified that every semantic requirement was extracted.

This phase is a nonblocking host-context adapter, not a natural-language requirement extractor. Phase 04 must introduce a trusted completeness signal before any routing based on `sufficient` is safe. Do not forward untrusted `req.body.requirements`, model output or user-specified completeness to the evaluator.
