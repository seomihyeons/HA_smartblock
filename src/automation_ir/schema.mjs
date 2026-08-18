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
