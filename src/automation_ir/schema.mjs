export const AUTOMATION_IR_SCHEMA_VERSION = 1;

const objectNode = {
  type: 'object',
  additionalProperties: true,
};

export const AUTOMATION_IR_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://ha-smartblock.local/schema/automation-ir-v1.json',
  title: 'HA SmartBlock normalized automation',
  type: 'object',
  additionalProperties: true,
  required: ['triggers', 'conditions', 'actions'],
  properties: {
    alias: { type: 'string' },
    id: {},
    mode: { type: 'string' },
    triggers: {
      type: 'array',
      items: objectNode,
    },
    conditions: {
      type: 'array',
      items: {
        anyOf: [
          objectNode,
          { type: 'string' },
        ],
      },
    },
    actions: {
      type: 'array',
      items: objectNode,
    },
  },
};

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function valuesEqual(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    return left.length === right.length && left.every((item, index) => valuesEqual(item, right[index]));
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && valuesEqual(left[key], right[key]));
}

function canonicalizeAliases(source, canonical, aliases, path, conflicts, normalizations) {
  const present = [canonical, ...aliases]
    .filter((key) => hasOwn(source, key) && source[key] != null)
    .map((key) => ({ key, value: source[key] }));

  if (!present.length) return undefined;
  const chosen = present.find(({ key }) => key === canonical) || present[0];
  for (const candidate of present) {
    if (!valuesEqual(chosen.value, candidate.value)) {
      conflicts.push(`${path} has conflicting ${chosen.key} and ${candidate.key} values.`);
      break;
    }
  }
  if (chosen.key !== canonical) {
    normalizations.push(`${path}.${chosen.key} was normalized to ${path}.${canonical}.`);
  }
  return chosen.value;
}

/** Converts accepted YAML/LLM spellings into the Blockly Automation IR shape. */
export function normalizeToAutomationIr(value) {
  if (!isObject(value)) {
    return { automation: value, conflicts: [], normalizations: [] };
  }

  const conflicts = [];
  const normalizations = [];
  const automation = { ...value };
  const triggerSource = canonicalizeAliases(automation, 'triggers', ['trigger'], 'automation', conflicts, normalizations);
  const conditionSource = canonicalizeAliases(automation, 'conditions', ['condition'], 'automation', conflicts, normalizations);
  const actionSource = canonicalizeAliases(automation, 'actions', ['action'], 'automation', conflicts, normalizations);

  automation.triggers = asArray(triggerSource).map((item, index) => {
    if (!isObject(item)) return item;
    const node = { ...item };
    const kind = canonicalizeAliases(node, 'trigger', ['platform', 'type'], `triggers[${index}]`, conflicts, normalizations);
    if (kind != null) node.trigger = kind;
    delete node.platform;
    delete node.type;
    return node;
  });
  automation.conditions = asArray(conditionSource);
  automation.actions = asArray(actionSource).map((item, index) => {
    if (!isObject(item)) return item;
    const node = { ...item };
    const service = canonicalizeAliases(node, 'action', ['service'], `actions[${index}]`, conflicts, normalizations);
    if (service != null) node.action = service;
    delete node.service;
    return node;
  });

  delete automation.trigger;
  delete automation.condition;
  delete automation.action;
  return { automation, conflicts, normalizations };
}

function validateObjectArray(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }

  value.forEach((item, index) => {
    if (!isObject(item)) errors.push(`${path}[${index}] must be an object.`);
  });
}

export function validateAutomationIr(value) {
  const errors = [];

  if (!isObject(value)) {
    return {
      valid: false,
      schema_version: AUTOMATION_IR_SCHEMA_VERSION,
      errors: ['automation must be an object.'],
    };
  }

  if (value.alias != null && typeof value.alias !== 'string') {
    errors.push('alias must be a string when provided.');
  }

  validateObjectArray(value.triggers, 'triggers', errors);

  if (!Array.isArray(value.conditions)) {
    errors.push('conditions must be an array.');
  } else {
    value.conditions.forEach((item, index) => {
      if (!isObject(item) && typeof item !== 'string') {
        errors.push(`conditions[${index}] must be an object or template string.`);
      }
    });
  }

  validateObjectArray(value.actions, 'actions', errors);

  return {
    valid: errors.length === 0,
    schema_version: AUTOMATION_IR_SCHEMA_VERSION,
    errors,
  };
}
