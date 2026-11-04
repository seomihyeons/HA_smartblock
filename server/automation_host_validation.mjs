import { normalizeToAutomationIr, validateAutomationIr } from '../src/automation_ir/schema.mjs';
import { capabilityForService, isServiceCompatibleWithEntity } from './capability_registry.mjs';

const string = (value) => String(value ?? '').trim();
const ids = (value) => Array.isArray(value) ? value.filter((v) => typeof v === 'string').map(string).filter(Boolean)
  : typeof value === 'string' ? value.split(',').map(string).filter(Boolean) : [];

function flattenFields(fields = {}) {
  const result = {};
  for (const [name, metadata] of Object.entries(fields)) {
    if (name === 'additional_fields' && metadata?.fields) Object.assign(result, flattenFields(metadata.fields));
    else result[name] = metadata;
  }
  return result;
}

/**
 * Common trusted host check for both provider-neutral and Ollama drafts.
 * This is NOT a semantic-equivalence, Blockly import, or runtime simulation.
 */
export function validateHostAutomation(source, cards = [], registry) {
  const normalized = normalizeToAutomationIr(source);
  const automation = normalized.automation;
  const structural = validateAutomationIr(automation);
  const structuralErrors = [...normalized.conflicts, ...structural.errors];
  const groundingErrors = [];
  const capabilityErrors = [];
  const known = new Set(cards.map((card) => string(card.entity_id)));

  if (structural.valid) {
    if (automation.actions.length === 0) structuralErrors.push('Automation must contain an action.');
    if (automation.triggers.length === 0) structuralErrors.push('Automation must contain a trigger.');
  }

  const checkReferences = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => checkReferences(child, path + '[' + index + ']'));
    } else if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (key === 'entity_id') {
          for (const id of ids(value)) {
            if (!known.has(id)) groundingErrors.push(path + '.' + key + ' does not exist in the live Home Assistant context: ' + id);
          }
        }
        checkReferences(value, path + '.' + key);
      }
    }
  };
  checkReferences(automation, 'automation');

  const checkAction = (action, path) => {
    if (!action || typeof action !== 'object') return;
    if (action.delay != null) return;
    if (Array.isArray(action.choose)) {
      for (const [index, choice] of action.choose.entries()) {
        for (const [j, nested] of (Array.isArray(choice.sequence) ? choice.sequence : []).entries()) {
          checkAction(nested, path + '.choose[' + index + '].sequence[' + j + ']');
        }
      }
      for (const [index, nested] of (Array.isArray(action.default) ? action.default : []).entries()) {
        checkAction(nested, path + '.default[' + index + ']');
      }
      return;
    }
    const service = string(action.action || action.service);
    const capability = registry && capabilityForService(service, registry);
    if (!capability || capability.available_in_home === false) {
      capabilityErrors.push(path + ' uses an unavailable service: ' + service);
      return;
    }
    const targetIds = ids(action.target?.entity_id ?? action.entity_id);
    if (capability.target_required && !targetIds.length) {
      capabilityErrors.push(path + ' requires a target entity for ' + service);
    }
    for (const id of targetIds) {
      if (known.has(id) && !isServiceCompatibleWithEntity(service, id, registry)) {
        capabilityErrors.push(path + ' target ' + id + ' is incompatible with ' + service);
      }
    }
    const data = action.data && typeof action.data === 'object' && !Array.isArray(action.data) ? action.data : {};
    const fields = flattenFields(capability.fields || {});
    for (const [name, metadata] of Object.entries(fields)) {
      if (metadata?.required === true && (data[name] == null || data[name] === '')) {
        capabilityErrors.push(path + ' is missing required service field ' + name);
      }
    }
    // Legacy services do not necessarily advertise required service fields.
    if (service.startsWith('notify.') && (data.message == null || data.message === '')) {
      capabilityErrors.push(path + ' is missing notification message.');
    }
  };
  for (const [index, action] of (Array.isArray(automation?.actions) ? automation.actions : []).entries()) {
    checkAction(action, 'actions[' + index + ']');
  }

  const errors = [...structuralErrors, ...groundingErrors, ...capabilityErrors];
  return {
    valid: errors.length === 0,
    schema_valid: structuralErrors.length === 0,
    grounded: groundingErrors.length === 0,
    capability_valid: capabilityErrors.length === 0,
    // Native Blockly conversion and YAML round-trip are checked only in the UI.
    blockly_supported: null,
    roundtrip_verified: null,
    requires_host_validation: false,
    errors,
  };
}
