import YAML from 'js-yaml';
import { normalizeToAutomationIr } from '../src/automation_ir/schema.mjs';
import { normalizeAutomationObject } from '../src/import/yaml_import.js';
import { renderAutomationToWorkspace } from '../src/import/yamlToBlocks.js';
import { yamlGenerator } from '../src/generators/yaml.js';
import { compareSemantic } from '../test/task_alt/semantic_compare.js';
import { runtimeEntities, setStudyRuntimeEntities } from '../src/data/entities_index.js';
import { validateDraft } from './llm_draft_service.mjs';
import { createHeadlessWorkspace } from './blockly_runtime.mjs';

function canonicalFields(value) {
  if (Array.isArray(value)) return value.map(canonicalFields);
  if (!value || typeof value !== 'object') return value;
  const node = { ...value };
  if (node.platform && !node.trigger) { node.trigger = node.platform; delete node.platform; }
  if (node.service && !node.action) { node.action = node.service; delete node.service; }
  if (node.mode === 'single') delete node.mode;
  if (node.description === '') delete node.description;
  return Object.fromEntries(Object.keys(node).sort().filter((key) => node[key] !== undefined).map((key) => [key, canonicalFields(node[key])]));
}

/** Validate the actual main importer/generator, not a model's support claim.
 * This synchronous section restores its process-local entity context before
 * returning; it never changes a browser workspace or contacts Home Assistant.
 */
export function validateAutomationCandidate(value, cards, registry) {
  const normalized = normalizeToAutomationIr(value);
  const errors = [...normalized.conflicts];
  if (!value || typeof value !== 'object' || Array.isArray(value)) errors.push('automation must be an object.');
  if (errors.length) return { valid: false, errors, schema_valid: false, grounded: false, blockly_supported: false };
  const automation = normalizeAutomationObject(normalized.automation);
  const checks = validateDraft(automation, cards, { registry });
  errors.push(...checks.errors);
  // Validate every literal entity reference, including nested conditions and
  // targets. Templates remain within the dialect and the round-trip check.
  const ids = new Set(cards.map((card) => card.entity_id));
  function walk(node, path = 'automation') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach((child, index) => walk(child, `${path}[${index}]`));
    for (const [key, child] of Object.entries(node)) {
      if (key === 'entity_id') for (const id of Array.isArray(child) ? child : [child]) {
        if (typeof id !== 'string' || !ids.has(id)) errors.push(`Unknown entity at ${path}.${key}: ${id}`);
      }
      walk(child, `${path}.${key}`);
    }
  }
  walk(automation);
  if (errors.length) return { ...checks, valid: false, errors, blockly_supported: false };
  const previousEntities = [...runtimeEntities];
  const workspace = createHeadlessWorkspace();
  try {
    setStudyRuntimeEntities(cards.map((card) => ({ entity_id: card.entity_id, state: card.state, attributes: {
      friendly_name: card.friendly_name, device_class: card.device_class, ...card.capability_attributes,
    } })));
    renderAutomationToWorkspace(workspace, automation, { clearBefore: true });
    const regeneratedYaml = yamlGenerator.workspaceToCode(workspace);
    const parsed = YAML.load(regeneratedYaml);
    const regenerated = normalizeAutomationObject(Array.isArray(parsed) ? parsed[0] : parsed);
    const comparison = compareSemantic(automation, regenerated);
    if (!comparison.semanticEqual) errors.push('Blockly round-trip changed the automation semantics.');
    // The existing corpus comparator intentionally ignores some unknown fields.
    // Generated drafts additionally require field preservation; otherwise a
    // silently dropped future option could receive a misleading support badge.
    if (JSON.stringify(canonicalFields(automation)) !== JSON.stringify(canonicalFields(regenerated))) {
      errors.push('Blockly round-trip changed or dropped a draft field.');
    }
    if (workspace.getTopBlocks(false).length !== 1) errors.push('Blockly import left detached blocks.');
    const rawCount = workspace.getAllBlocks(false).filter((block) => /raw/.test(block.type)).length;
    return { ...checks, valid: !errors.length, errors, grounded: !errors.length,
      blockly_supported: !errors.length && rawCount === 0,
      blockly_preserved: !errors.length, raw_block_count: rawCount,
      roundtrip_verified: !errors.length, regenerated_yaml: regeneratedYaml,
    };
  } catch (error) {
    return { ...checks, valid: false, errors: [`Blockly validation failed: ${error.message}`], blockly_supported: false, roundtrip_verified: false };
  } finally {
    workspace.dispose();
    setStudyRuntimeEntities(previousEntities);
  }
}
