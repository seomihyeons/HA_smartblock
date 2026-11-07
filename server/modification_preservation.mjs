import yaml from 'js-yaml';
import { normalizeToAutomationIr } from '../src/automation_ir/schema.mjs';

const text = (value) => String(value ?? '').trim();

function loadAutomation(baseYaml) {
  // Blockly exports one automation in HA's conventional "- alias: ..." list
  // form, while LLM drafts can be a single mapping. Both represent one rule.
  const parsed = yaml.load(text(baseYaml), { schema: yaml.JSON_SCHEMA });
  const source = Array.isArray(parsed)
    ? (parsed.length === 1 ? parsed[0] : null)
    : parsed;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Expected exactly one existing automation mapping.');
  }
  const normalized = normalizeToAutomationIr(source);
  if (normalized.conflicts.length) {
    throw new Error(normalized.conflicts.join('; '));
  }
  return normalized.automation;
}

// Structural equality is separate from preservation and conflict analysis.
// A modification that leaves the automation identical is not a successful edit.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function hasAutomationChanged({ baseYaml, automation }) {
  const before = loadAutomation(baseYaml);
  const normalized = normalizeToAutomationIr(automation);
  if (normalized.conflicts.length) {
    throw new Error(normalized.conflicts.join('; '));
  }
  return JSON.stringify(canonical(before)) !== JSON.stringify(canonical(normalized.automation));
}

/**
 * Technical integrity checks for a modification. The LLM receives the full
 * base automation, user request, and live capability context, and therefore
 * owns semantic decisions such as whether an action should be removed or a
 * device replaced. This layer deliberately does not re-interpret natural
 * language with keyword/entity heuristics; host validation separately checks
 * that every entity and service that remains in the final YAML is live.
 */
export function validateModificationPreservation({ baseYaml, automation }) {
  const errors = [];
  let base;
  try {
    base = loadAutomation(baseYaml);
  } catch (error) {
    // A malformed or ambiguous base must never bypass preservation checks.
    return {
      valid: false,
      errors: [`Could not validate existing automation for preservation: ${error.message}`],
    };
  }
  if (!automation || typeof automation !== 'object' || Array.isArray(automation)) {
    return { valid: false, errors: ['The modified automation must be a mapping.'] };
  }
  if (base.id != null && automation.id !== base.id) {
    errors.push('Modification changed the existing automation ID.');
  }
  // Keep non-ECA root settings such as mode, variables, and metadata unless a
  // future explicit setting-edit contract states otherwise.
  for (const [key, value] of Object.entries(base)) {
    if (['alias', 'id', 'triggers', 'conditions', 'actions'].includes(key)) continue;
    if (JSON.stringify(automation[key]) !== JSON.stringify(value)) {
      errors.push(`Modification changed the existing ${key} setting.`);
    }
  }
  return { valid: errors.length === 0, errors };
}
