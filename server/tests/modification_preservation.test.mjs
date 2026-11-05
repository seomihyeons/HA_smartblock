import assert from 'node:assert/strict';
import test from 'node:test';
import { validateModificationPreservation } from '../modification_preservation.mjs';

const base = `- alias: Prepare for Sleep
  triggers:
    - trigger: time
      at: '20:00:00'
  conditions: []
  actions:
    - action: light.turn_off
      target:
        entity_id: light.living_room
    - action: light.turn_off
      target:
        entity_id: light.bedroom
    - action: cover.close_cover
      target:
        entity_id: cover.bedroom_curtain
`;

const modified = {
  alias: 'Prepare for Sleep',
  triggers: [{ trigger: 'time', at: '20:00:00' }],
  conditions: [],
  actions: [
    { action: 'light.turn_off', target: { entity_id: 'light.living_room' } },
    { action: 'light.turn_off', target: { entity_id: 'light.bedroom' } },
    { action: 'cover.close_cover', target: { entity_id: 'cover.bedroom_curtain' } },
  ],
};

test('accepts a single-item Blockly YAML list as one automation, not numeric metadata', () => {
  const result = validateModificationPreservation({
    baseYaml: base, automation: modified, command: 'Make it more relaxing.',
  });
  assert.deepEqual(result, { valid: true, errors: [] });
});

test('still rejects silent removal of existing entity and action', () => {
  const result = validateModificationPreservation({
    baseYaml: base,
    automation: { ...modified, actions: modified.actions.slice(0, 2) },
    command: 'Make it more relaxing.',
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /cover\.bedroom_curtain/);
  assert.match(result.errors.join(' '), /removed existing actions/);
});

test('still protects real HA root metadata', () => {
  const result = validateModificationPreservation({
    baseYaml: base.replace('  conditions: []', '  mode: queued\n  conditions: []'),
    automation: { ...modified, mode: 'single' },
    command: 'Make it more relaxing.',
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /mode setting/);
});

test('rejects multiple base automations instead of treating them as one rule', () => {
  const result = validateModificationPreservation({
    baseYaml: base + base,
    automation: modified,
    command: 'Make it more relaxing.',
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /exactly one/);
});

test('accepts a single automation mapping as before', () => {
  const result = validateModificationPreservation({
    baseYaml: base.replace(/^- /, '').replace(/^  /gm, ''),
    automation: modified,
    command: 'Make it more relaxing.',
  });
  assert.equal(result.valid, true);
});
