# Normalized Home Assistant Automation JSON

## Purpose

HA SmartBlock converts Home Assistant YAML into a normalized JavaScript object before creating Blockly blocks. This object is the shared boundary between YAML import, Blockly rendering, semantic comparison, and LLM draft validation.

The current schema version is `1`. The machine-readable schema and validator live in `src/automation_ir/schema.mjs`.

## Pipeline

```text
Home Assistant YAML
  -> yamlTextToInternalJson
  -> normalizeAutomationObject
  -> normalized automation JSON
  -> renderAutomationToWorkspace
  -> Blockly
```

The normalized object is kept in memory. The `Imported JSON (normalized)` panel displays it with `JSON.stringify`; importing YAML does not create a JSON file on disk.

## Top-level contract

```json
{
  "alias": "Optional automation name",
  "triggers": [],
  "conditions": [],
  "actions": []
}
```

- `triggers`, `conditions`, and `actions` always use arrays.
- `trigger`, `condition`, and `action` input aliases are accepted and normalized to the plural keys.
- Unknown top-level and node fields are allowed and must be preserved.
- Conditions may be objects or Home Assistant template-condition strings.
- This version intentionally describes the existing normalized shape. It does not introduce a second IR or rewrite existing automation objects.

## Normalized fields

- `entity_id`, `target.entity_id`, `target.device_id`, and `target.area_id` are normalized to arrays when present.
- `for` and `delay` time values may be normalized to `{ hours, minutes, seconds }` objects.
- `condition: and|or|not` nodes are normalized to `{ and: [] }`, `{ or: [] }`, or `{ not: [] }` trees.
- `trigger`, `platform`, and `type`, and `action` and `service`, remain accepted compatibility spellings while the existing importers are migrated incrementally.

## Unknown syntax policy

Normalization must not delete fields merely because Blockly does not understand them. Unsupported actions are represented by an individual read-only raw action block, preserving their position among supported actions. A supported action before or after an unsupported action must remain editable.

Raw fallback is a preservation mechanism, not a claim that the syntax has full visual-block support.

## LLM boundary

LLM drafts must satisfy the same top-level schema before entity grounding and MVP capability checks run. Schema validity alone never authorizes saving an automation or calling a Home Assistant action.

## Compatibility rules

1. Existing 861-case semantic regression results must not regress.
2. Unknown fields must survive normalization.
3. Unsupported actions must fall back individually rather than converting the entire action section to raw YAML.
4. New syntax support should add an adapter from this object to a block; it should not add a parallel normalization format.
