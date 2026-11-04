import yaml from 'js-yaml';
import { normalizeToAutomationIr, validateAutomationIr } from '../src/automation_ir/schema.mjs';

const value = (input) => String(input ?? '').trim();
const asArray = (item) => Array.isArray(item) ? item : item == null ? [] : [item];

/**
 * Inspect a selected automation without provider calls, HA service calls or writes.
 * Static checks never claim runtime correctness or round-trip editability.
 */
export function inspectSelectedAutomation(context, operation) {
  if (!context || !['inspect', 'explain'].includes(operation) || !value(context.base_yaml)) {
    return { ok: false, error: 'A selected automation YAML context is required.' };
  }
  let parsed;
  try {
    parsed = yaml.load(value(context.base_yaml), { schema: yaml.JSON_SCHEMA });
    if (Array.isArray(parsed)) {
      if (parsed.length !== 1) throw new Error('Select exactly one automation.');
      [parsed] = parsed;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Selected YAML does not contain a single automation.');
    }
  } catch (error) {
    return { ok: false, error: 'The selected automation YAML could not be parsed.', detail: value(error.message) };
  }
  const normalized = normalizeToAutomationIr(parsed);
  const irValidation = validateAutomationIr(normalized.automation);
  const errors = [...normalized.conflicts, ...irValidation.errors];
  const automation = normalized.automation;
  const triggers = asArray(automation?.triggers);
  const conditions = asArray(automation?.conditions);
  const actions = asArray(automation?.actions);
  if (!triggers.length) errors.push('No trigger is configured (manual-only automations may be intentional).');
  if (!actions.length) errors.push('No action is configured.');
  const actionNames = actions.map((action) => value(action?.action || action?.service) || '[structural action]');
  const summary = [
    value(automation?.alias) || value(context.title) || 'Selected automation',
    'Triggers: ' + triggers.length + '; Conditions: ' + conditions.length + '; Actions: ' + actions.length + '.',
    actionNames.length ? 'Actions: ' + actionNames.join(', ') + '.' : '',
    errors.length ? 'Static review notes: ' + errors.join(' ') : 'Basic YAML and IR structure checks passed.',
    'No changes were made. This review does not verify live entities, conditions at runtime, conflicts or Blockly round-trip.',
  ].filter(Boolean).join('\n');
  return {
    ok: true,
    operation,
    summary,
    validation: {
      schema_valid: irValidation.valid && normalized.conflicts.length === 0,
      errors,
      grounded: null,
      capability_valid: null,
      blockly_supported: null,
      roundtrip_verified: null,
    },
    counts: { triggers: triggers.length, conditions: conditions.length, actions: actions.length },
  };
}
