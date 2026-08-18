import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeAutomationObject,
} from '../../src/import/yaml_import.js';
import {
  AUTOMATION_IR_SCHEMA,
  validateAutomationIr,
} from '../../src/automation_ir/schema.mjs';
import {
  mapActionsWithIndividualFallback,
} from '../../src/import/action_fallback.mjs';

test('normalizer produces the documented plural-array shape', () => {
  const normalized = normalizeAutomationObject({
    alias: 'Door light',
    trigger: {
      platform: 'state',
      entity_id: 'binary_sensor.front_door',
    },
    condition: [],
    action: {
      action: 'light.turn_on',
      target: { entity_id: 'light.entrance' },
    },
  });

  assert.equal(AUTOMATION_IR_SCHEMA.required.includes('triggers'), true);
  assert.deepEqual(normalized.triggers[0].entity_id, ['binary_sensor.front_door']);
  assert.deepEqual(normalized.actions[0].target.entity_id, ['light.entrance']);
  assert.equal(validateAutomationIr(normalized).valid, true);
});

test('normalizer preserves unknown top-level and node fields', () => {
  const input = {
    future_root: { enabled: true },
    triggers: [{
      trigger: 'future_trigger',
      future_trigger_option: { threshold: 7 },
    }],
    conditions: [{
      condition: 'future_condition',
      future_condition_option: ['a', 'b'],
    }],
    actions: [{
      action: 'custom_domain.future_action',
      future_action_option: { nested: { value: 42 } },
    }],
  };

  const normalized = normalizeAutomationObject(input);

  assert.deepEqual(normalized.future_root, { enabled: true });
  assert.deepEqual(
    normalized.triggers[0].future_trigger_option,
    { threshold: 7 },
  );
  assert.deepEqual(
    normalized.conditions[0].future_condition_option,
    ['a', 'b'],
  );
  assert.deepEqual(
    normalized.actions[0].future_action_option,
    { nested: { value: 42 } },
  );
});

test('normalizer preserves choose structure and normalizes delay duration', () => {
  const normalized = normalizeAutomationObject({
    triggers: [],
    conditions: [],
    actions: [
      {
        choose: [{
          conditions: [{ condition: 'state', entity_id: 'input_boolean.guest', state: 'on' }],
          sequence: [{ action: 'light.turn_on', target: { entity_id: 'light.guest_room' } }],
        }],
        default: [{ action: 'light.turn_off', target: { entity_id: 'light.guest_room' } }],
      },
      { delay: '00:01:30' },
    ],
  });

  assert.equal(normalized.actions[0].choose[0].sequence[0].action, 'light.turn_on');
  assert.equal(normalized.actions[0].default[0].action, 'light.turn_off');
  assert.deepEqual(normalized.actions[1].delay, {
    hours: 0,
    minutes: 1,
    seconds: 30,
  });
});

test('schema validator rejects malformed top-level sections', () => {
  const result = validateAutomationIr({
    triggers: {},
    conditions: [],
    actions: 'light.turn_on',
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /triggers must be an array/);
  assert.match(result.errors.join('\n'), /actions must be an array/);
});

test('unsupported actions fall back individually and keep their order', () => {
  const actions = [
    { action: 'light.turn_on' },
    { future_action: { option: 123 } },
    { action: 'vacuum.start' },
  ];

  const mapped = mapActionsWithIndividualFallback(actions, {
    createAction: (action) => {
      if (action.future_action) throw new Error('unsupported');
      return { kind: 'block', action: action.action };
    },
    createRawAction: (action) => ({ kind: 'raw', action }),
  });

  assert.deepEqual(mapped, [
    { kind: 'block', action: 'light.turn_on' },
    { kind: 'raw', action: actions[1] },
    { kind: 'block', action: 'vacuum.start' },
  ]);
});

test('a null action mapping also falls back only for that action', () => {
  const actions = [{ action: 'light.turn_on' }, { action: 'unknown.do' }];
  const mapped = mapActionsWithIndividualFallback(actions, {
    createAction: (action) => (
      action.action === 'unknown.do' ? null : { kind: 'block', action: action.action }
    ),
    createRawAction: (action) => ({ kind: 'raw', action }),
  });

  assert.equal(mapped[0].kind, 'block');
  assert.equal(mapped[1].kind, 'raw');
});
