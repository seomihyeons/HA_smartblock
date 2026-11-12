import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectSelectedAutomation } from '../automation_readonly.mjs';
import { createAssistantRequestRouter } from '../assistant_request_router.mjs';
import { validateHostAutomation } from '../automation_host_validation.mjs';
import { createCapabilityRegistry } from '../capability_registry.mjs';

const baseYaml = [
  'alias: Morning light',
  'triggers:',
  '  - trigger: state',
  '    entity_id: binary_sensor.motion',
  '    to: "on"',
  'conditions: []',
  'actions:',
  '  - action: light.turn_on',
  '    target:',
  '      entity_id: light.hall',
].join('\n');

test('inspect and explain never call the LLM or execute Home Assistant actions', async () => {
  const router = createAssistantRequestRouter({
    createDraft: async (payload) => ({
      status: 'automation_readonly_ready',
      automation_context: payload.automation_context,
    }),
    previewControl: async () => { throw new Error('No preview'); },
    executeControl: async () => { throw new Error('No execution'); },
    queryInformation: async () => { throw new Error('No information query'); },
  });
  for (const operation of ['inspect', 'explain']) {
    const reply = await router.handle({
      command: operation + ' this automation',
      automation_context: { operation, base_yaml: baseYaml, source: 'workspace', title: 'Morning light' },
    });
    assert.equal(reply.resolution.status, 'success');
    assert.equal(reply.result.kind, 'automation_readonly');
    assert.match(reply.message, /No changes were made/);
  }
});

test('read-only inspector rejects malformed YAML without side effects', () => {
  const reply = inspectSelectedAutomation({ base_yaml: 'alias: [oops', title: 'Bad' }, 'inspect');
  assert.equal(reply.ok, false);
});

test('host validator distinguishes entity grounding, capability and unverified Blockly conversion', () => {
  const registry = createCapabilityRegistry({ serviceCatalog: [
    { domain: 'light', services: { turn_on: { fields: {} } } },
    { domain: 'notify', services: {
      send_message: { fields: { message: { required: true } }, target: { entity: { domain: ['notify'] } } },
      mobile_app_guest: { fields: { message: { required: true } } },
    } },
  ] });
  const cards = [
    { entity_id: 'binary_sensor.motion', domain: 'binary_sensor' },
    { entity_id: 'light.hall', domain: 'light' },
    { entity_id: 'notify.alice', domain: 'notify' },
  ];
  const valid = {
    alias: 'Notify',
    triggers: [{ trigger: 'state', entity_id: 'binary_sensor.motion', to: 'on' }],
    conditions: [],
    actions: [
      { action: 'light.turn_on', target: { entity_id: 'light.hall' } },
      { action: 'notify.send_message', target: { entity_id: 'notify.alice' }, data: { message: 'Motion detected' } },
    ],
  };
  const passed = validateHostAutomation(valid, cards, registry);
  assert.equal(passed.valid, true, JSON.stringify(passed.errors));
  assert.equal(passed.blockly_supported, null);
  assert.equal(passed.roundtrip_verified, null);
  const missingMessage = structuredClone(valid);
  missingMessage.actions[1].data = {};
  assert.equal(validateHostAutomation(missingMessage, cards, registry).capability_valid, false);
  const missingDevice = structuredClone(valid);
  missingDevice.actions[1].target.entity_id = 'notify.unknown';
  assert.equal(validateHostAutomation(missingDevice, cards, registry).grounded, false);
  const legacy = structuredClone(valid);
  legacy.actions[1] = { action: 'notify.mobile_app_guest', data: { message: 'Motion detected' } };
  assert.equal(validateHostAutomation(legacy, cards, registry).valid, true);
});

test('empty automated plan is rejected even when its IR shape is legal', () => {
  const registry = createCapabilityRegistry();
  const result = validateHostAutomation({ triggers: [], conditions: [], actions: [] }, [], registry);
  assert.equal(result.schema_valid, false);
  assert.equal(result.valid, false);
});

test('router does not turn claimed planner Blockly compatibility into verified import', async () => {
  const router = createAssistantRequestRouter({
    createDraft: async () => ({
      intent: 'automation',
      plan: { operation: 'automation_generation', yaml: baseYaml },
      automation: {
        alias: 'Morning light',
        triggers: [{ trigger: 'state', entity_id: 'binary_sensor.motion', to: 'on' }],
        conditions: [],
        actions: [{ action: 'light.turn_on', target: { entity_id: 'light.hall' } }],
      },
      validation: { valid: true, schema_valid: true, grounded: true, capability_valid: true, blockly_supported: true },
    }),
    previewControl: async () => { throw new Error('control not expected'); },
    executeControl: async () => { throw new Error('execution not expected'); },
    queryInformation: async () => { throw new Error('query not expected'); },
  });
  const response = await router.handle({ command: 'Create a morning light rule' });
  assert.equal(response.resolution.status, 'success');
  assert.equal(response.result.validation.schema_valid, true);
  assert.equal(response.result.validation.blockly_supported, null);
  assert.equal(response.result.validation.roundtrip_verified, null);
});
