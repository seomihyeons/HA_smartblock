import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new WeakMap();

function validatorFor(schema) {
  if (!schema || typeof schema !== 'object') {
    throw new TypeError('A JSON Schema object is required.');
  }
  let validator = validators.get(schema);
  if (!validator) {
    validator = ajv.compile(schema);
    validators.set(schema, validator);
  }
  return validator;
}

export function validateJsonSchema(schema, value) {
  const validator = validatorFor(schema);
  const valid = validator(value);
  return {
    valid: Boolean(valid),
    errors: valid
      ? []
      : (validator.errors || []).map((error) => {
        const path = error.instancePath || '/';
        return `${path} ${error.message || 'is invalid'}`;
      }),
  };
}
