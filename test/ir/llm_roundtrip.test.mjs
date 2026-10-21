import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAutomationCandidate } from '../../server/automation_validation.mjs';
import { createCapabilityRegistry } from '../../server/capability_registry.mjs';
import { runtimeEntities, setStudyRuntimeEntities } from '../../src/data/entities_index.js';

const cards = [
  { entity_id: 'binary_sensor.entrance_motion', friendly_name: 'Motion', domain: 'binary_sensor', device_class: 'motion', state: 'off', supported_actions: [] },
  { entity_id: 'light.test', friendly_name: 'Test', domain: 'light', state: 'off', supported_actions: ['light.turn_on', 'light.turn_off'] },
];
const automation = () => ({ alias: 'Test draft', triggers: [{ trigger: 'state', entity_id: 'binary_sensor.entrance_motion', to: 'on' }], conditions: [], actions: [{ action: 'light.turn_on', target: { entity_id: 'light.test' } }] });

test('a grounded LLM draft passes actual main Blockly import/generation without changing runtime entities', () => {
  setStudyRuntimeEntities([{ entity_id: 'sensor.study', state: '42', attributes: { friendly_name: 'Study' } }]);
  const previous = structuredClone(runtimeEntities);
  const result = validateAutomationCandidate(automation(), cards, createCapabilityRegistry());
  assert.equal(result.valid, true, JSON.stringify(result));
  assert.equal(result.roundtrip_verified, true);
  assert.equal(result.blockly_supported, true);
  assert.match(result.regenerated_yaml, /light.turn_on/);
  assert.deepEqual(runtimeEntities, previous);
});

test('legacy root/platform/service aliases have the same round-trip boundary', () => {
  const result = validateAutomationCandidate({ alias: 'Legacy draft', trigger: [{ platform: 'state', entity_id: 'binary_sensor.entrance_motion', to: 'on' }], action: [{ service: 'light.turn_on', target: { entity_id: 'light.test' } }] }, cards, createCapabilityRegistry());
  assert.equal(result.valid, true, JSON.stringify(result));
});

test('an invented trigger and a nested unknown entity are rejected before import', () => {
  const draft = automation();
  draft.triggers[0].trigger = 'invented_trigger';
  draft.conditions = [{ condition: 'and', conditions: [{ condition: 'state', entity_id: 'sensor.missing', state: 'on' }] }];
  const result = validateAutomationCandidate(draft, cards, createCapabilityRegistry());
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /invented_trigger/);
  assert.match(result.errors.join(' '), /sensor.missing/);
});

test('a lost field cannot receive a successful visual validation flag', () => {
  const draft = automation();
  draft.triggers[0].unexpected_behavior = 'must survive';
  const result = validateAutomationCandidate(draft, cards, createCapabilityRegistry());
  if (result.valid) {
    assert.match(result.regenerated_yaml, /unexpected_behavior/);
    assert.equal(result.blockly_preserved, true);
  } else assert.equal(result.blockly_supported, false);
});
