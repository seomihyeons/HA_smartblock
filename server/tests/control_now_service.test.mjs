import assert from 'node:assert/strict';
import test from 'node:test';
import { createCapabilityRegistry } from '../capability_registry.mjs';
import { createControlNowService } from '../control_now_service.mjs';

const entities = [
  { entity_id: 'light.kitchen', friendly_name: 'Kitchen Light', domain: 'light', supported_actions: ['light.turn_on', 'light.turn_off'] },
  { entity_id: 'switch.coffee', friendly_name: 'Coffee Maker', domain: 'switch', supported_actions: ['switch.turn_on', 'switch.turn_off'] },
  { entity_id: 'switch.fan', friendly_name: 'Fan', domain: 'switch', supported_actions: ['switch.turn_on', 'switch.turn_off'] },
  { entity_id: 'fan.study', friendly_name: 'Study Fan', domain: 'fan', supported_actions: ['fan.turn_on', 'fan.turn_off'] },
  { entity_id: 'climate.bedroom', friendly_name: 'Thermostat', domain: 'climate', supported_actions: ['climate.set_temperature'] },
];

function fixture(overrides = {}) {
  const calls = [];
  let time = 1_000;
  let cards = structuredClone(entities);
  const registry = createCapabilityRegistry();
  const service = createControlNowService({
    fetchCapabilityContext: async () => ({ entityCards: cards, registry }),
    callService: async (request) => { calls.push(request); },
    createId: () => 'preview-1',
    now: () => time,
    verificationAttempts: 1,
    wait: async () => {},
    ...overrides,
  });
  return { service, calls, setCards(value) { cards = value; }, advance(ms) { time += ms; } };
}

test('previews and executes any registry-approved low-risk domain exactly once', async () => {
  const f = fixture();
  const preview = await f.service.preview({
    service: 'switch.turn_on',
    candidate_entity_ids: ['switch.coffee'],
  });
  assert.equal(preview.status, 'ready_to_execute');
  assert.equal(preview.entity.entity_id, 'switch.coffee');
  const result = await f.service.execute({ execution_id: preview.execution_id });
  assert.equal(result.status, 'success');
  assert.deepEqual(f.calls, [{ service: 'switch.turn_on', entity_id: 'switch.coffee' }]);
  await assert.rejects(f.service.execute({ execution_id: preview.execution_id }), /invalid, expired, or already used/);
});

test('requires selection when grounded candidates remain ambiguous', async () => {
  const f = fixture();
  const preview = await f.service.preview({
    service: 'switch.turn_off',
    candidate_entity_ids: ['switch.coffee', 'switch.fan'],
  });
  assert.equal(preview.status, 'needs_confirmation');
  assert.equal(preview.candidates.length, 2);
  const selected = await f.service.preview({
    service: 'switch.turn_off',
    candidate_entity_ids: ['switch.coffee', 'switch.fan'],
    selected_entity_id: 'switch.fan',
  });
  assert.equal(selected.entity.entity_id, 'switch.fan');
});

test('accepts registered services regardless of risk metadata, but rejects incompatible and forged requests', async () => {
  const f = fixture();
  const climate = await f.service.preview({ service: 'climate.set_temperature', candidate_entity_ids: ['climate.bedroom'] });
  assert.equal(climate.status, 'ready_to_execute');
  await assert.rejects(
    f.service.preview({ service: 'light.turn_on', candidate_entity_ids: ['switch.coffee'] }),
    (error) => error.code === 'no_compatible_entity',
  );
  await assert.rejects(
    f.service.preview({ service: 'switch.turn_on', candidate_entity_ids: ['switch.coffee'], selected_entity_id: 'switch.forged' }),
    (error) => error.code === 'invalid_selection',
  );
});

test('treats a reversible fan state change as low risk without a fan-specific rule', async () => {
  const f = fixture();
  const preview = await f.service.preview({ service: 'fan.turn_on', candidate_entity_ids: ['fan.study'] });
  assert.equal(preview.status, 'ready_to_execute');
});

test('revalidates capability and entity immediately before execution', async () => {
  const f = fixture();
  const preview = await f.service.preview({ service: 'light.turn_off', candidate_entity_ids: ['light.kitchen'] });
  f.setCards(entities.filter(({ entity_id }) => entity_id !== 'light.kitchen'));
  await assert.rejects(
    f.service.execute({ execution_id: preview.execution_id }),
    (error) => error.code === 'capability_revalidation_failed',
  );
  assert.equal(f.calls.length, 0);
});

test('executes every compatible target for an explicit collection selector', async () => {
  const f = fixture();
  const preview = await f.service.preview({
    service: 'switch.turn_off',
    target: { selector: 'entity_filter', filter: { entity_ids: ['switch.coffee', 'switch.fan'] } },
  });
  assert.equal(preview.status, 'ready_to_execute');
  assert.equal(preview.target_count, 2);
  await f.service.execute({ execution_id: preview.execution_id });
  assert.deepEqual(f.calls, [{ service: 'switch.turn_off', entity_id: ['switch.coffee', 'switch.fan'] }]);
});

test('reports confirmed only after a post-service live state observation', async () => {
  let reads = 0;
  const registry = createCapabilityRegistry();
  const offCards = [{ ...entities[0], state: 'off' }];
  const onCards = [{ ...entities[0], state: 'on' }];
  const service = createControlNowService({
    fetchCapabilityContext: async () => ({
      entityCards: reads++ < 2 ? offCards : onCards,
      registry,
    }),
    callService: async () => {},
    createId: () => 'verify-1',
    verificationAttempts: 1,
  });
  const preview = await service.preview({ service: 'light.turn_on', candidate_entity_ids: ['light.kitchen'] });
  const result = await service.execute({ execution_id: preview.execution_id });
  assert.equal(result.verification.status, 'confirmed');
  assert.equal(result.verification.observed[0].state, 'on');
});

test('keeps the API result successful but marks an unchanged state as unconfirmed', async () => {
  const f = fixture();
  const preview = await f.service.preview({ service: 'light.turn_on', candidate_entity_ids: ['light.kitchen'] });
  const result = await f.service.execute({ execution_id: preview.execution_id });
  assert.equal(result.status, 'success');
  assert.equal(result.verification.status, 'not_confirmed');
});

test('service failure consumes the one-time preview', async () => {
  const f = fixture({ callService: async () => { throw new Error('Home Assistant service request failed: 500'); } });
  const preview = await f.service.preview({ service: 'light.turn_on', candidate_entity_ids: ['light.kitchen'] });
  await assert.rejects(f.service.execute({ execution_id: preview.execution_id }), /failed: 500/);
  await assert.rejects(f.service.execute({ execution_id: preview.execution_id }), /invalid, expired, or already used/);
});
