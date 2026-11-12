# Context Sufficiency Check — Phase 03 preflight

Implemented as `server/context_sufficiency.mjs`. This **pure function does not call the LLM, Home Assistant, or Tool APIs** and is not yet wired to the runtime router. The existing One-Call behavior is therefore unchanged.

## Contract

- `checkContextSufficiency(input)` — deterministic preflight.
- `CONTEXT_SUFFICIENCY_INPUT_SCHEMA` — JSON Schema describing `requirements`, `context`, and optional `request`.
- `CONTEXT_SUFFICIENCY_OUTPUT_SCHEMA` — JSON Schema describing its result.
- The module performs its own basic runtime structural validation; the exported JSON Schemas can be used for stricter validation at a trusted integration boundary.

### Trusted input

`requirements.source` must be `host_verified` or `provisional`, and `requirements.complete` must be a boolean. A *trusted host-side requirement extraction process* must establish completeness; neither an LLM assertion nor a client field can establish it by itself. If it has not been verified, use `source: 'provisional'` or `complete: false`.

`requirements` supports:

| Field | Description |
| --- | --- |
| `entities` | Required live HA Entity IDs |
| `collections` | `{domain?, area?, require_all?}`; complete collection needs all live members in the initial LLM context |
| `attributes` | `{entity_id, name}` for current state or capabilities |
| `services` | `{entity_id, service}` for required HA actions |
| `automation_details` | `{automation_id}` for complete YAML |
| `history` | `{entity_id, start, end}` with a bounded interval |
| `traces` | `{automation_id, run_id?}` for execution traces |
| `household_occupancy` | Requires a trusted *complete* roster |
| `preferences` | `{person_id, key}` that must have verified evidence |

`context.entity_cards` is the **full filtered live HA card set**; `context.retrieved_entity_ids` is the **subset actually passed to the LLM**. The optional fields are `entity_resolution`, `automation_catalog`, `provided_automation_ids`, `history_evidence`, `trace_evidence`, `household_roster`, and `preference_evidence`. `automation_catalog` entries for this preflight must expose `automation_id`, optionally `base_yaml`. The existing planner's `id` summaries must be normalized by a future adapter; do not pass client-provided catalog entries as verified HA facts.

### Result

Three statuses: `sufficient`, `insufficient`, or `needs_clarification`.

Each result includes `next_action`: `one_call`, `expand_context`, `tool_lookup`, `existing_planner`, or `clarify`; `requirements_verified`; `missing_context`; `clarifications`; `proposed_tool_calls`; and summary `counts`.

`proposed_tool_calls` are **suggestions only**, never executable authority. The proposed read-only tools (`get_entity_details`, `get_automation_details`, `get_state_history`, `get_automation_trace`) are not implemented by this change. A future Tool Registry must validate each call again and enforce its own authorization, bounds and timeouts.

## Rules

1. Ambiguous resolver result or missing live Entity → `clarify`.
2. Required live Entity omitted from candidate set → `expand_context`; no new HA API call.
3. Required whole Area/Domain collection → compare with the full live card set, not the retrieval top-K.
4. Current state/property absent from EntityCard → propose `get_entity_details`.
5. Required service absent from nonempty supported actions → clarification; empty capability metadata → lookup.
6. Relevant YAML already cached but not model-visible → expand context; known automation missing YAML → lookup.
7. Missing requested History interval or Trace → corresponding read-only lookup.
8. No trusted complete resident roster or verified user preference → clarification; never infer household membership from motion or `person` alone.
9. Provisional/incomplete semantics → `insufficient` / `existing_planner`, **not** `sufficient`. A rule-free JSON field or keyword detector cannot prove full intent coverage.

When multiple dependencies are missing, all issues are returned; the primary `next_action` prioritizes clarification, then unverified requirement fallback, then context expansion, then Tool lookup. The future planner must resolve all returned missing dependencies before treating context as sufficient.

## Example: initial context already sufficient

```js
import { checkContextSufficiency } from './server/context_sufficiency.mjs';
const result = checkContextSufficiency({
  requirements: {
    source: 'host_verified', complete: true,
    entities: ['light.bedroom'],
    services: [{ entity_id: 'light.bedroom', service: 'light.turn_off' }],
  },
  context: {
    entity_cards: [{
      entity_id: 'light.bedroom', state: 'on', domain: 'light',
      supported_actions: ['light.turn_off'],
    }],
    retrieved_entity_ids: ['light.bedroom'],
  },
});
// result.status === 'sufficient'; result.next_action === 'one_call'
```

## Scope and next step

This change only adds the contract and evaluator. It does **not** extract trustworthy requirements from open-ended text, expose an API endpoint, select tools, or modify `analyze_server.js`, `assistant_request_router.mjs`, or the Python LLM service. Integrate only after establishing a trusted requirement source and mapping of existing HA context structures. Do not use this preflight as proof that the generated YAML is semantically correct or conflict-free.

Local tests, experiments and outputs stay outside version control.
