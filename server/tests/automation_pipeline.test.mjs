import assert from 'node:assert/strict';
import test from 'node:test';
import { createAutomationDraft } from '../llm_draft_service.mjs';
import { validateSemanticAlignment } from '../automation_goal_analyzer.mjs';

const cards = [
  { entity_id: 'binary_sensor.entrance_motion', friendly_name: 'Entrance Motion', domain: 'binary_sensor', state: 'off', device_class: 'motion', supported_actions: [] },
  { entity_id: 'light.living_room', friendly_name: 'Living Room Light', domain: 'light', state: 'on', supported_actions: ['light.turn_on', 'light.turn_off'] },
  { entity_id: 'switch.coffee', friendly_name: 'Coffee Maker', domain: 'switch', state: 'off', supported_actions: ['switch.turn_on', 'switch.turn_off'] },
  { entity_id: 'climate.bedroom', friendly_name: 'Bedroom Thermostat', domain: 'climate', state: 'heat', supported_actions: ['climate.set_temperature'] },
];

const capabilities = {
  trigger_kinds: ['state', 'time'],
  condition_kinds: ['state', 'numeric_state', 'time'],
  action_structures: ['service', 'delay', 'choose'],
  services: [
    { id: 'light.turn_on', risk: 'low' },
    { id: 'light.turn_off', risk: 'low' },
    { id: 'switch.turn_on', risk: 'low' },
    { id: 'switch.turn_off', risk: 'low' },
    { id: 'climate.set_temperature', risk: 'medium' },
  ],
};

function response(output) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ model: 'qwen3:4b', message: { content: JSON.stringify(output) } }),
    text: async () => '',
  };
}

function goal(overrides = {}) {
  return {
    status: 'ready',
    goal_type: 'automation_creation',
    goal_category: 'appliance_routine',
    home_supports_goal: true,
    trigger_specified: true,
    trigger_kind: 'state',
    primary_service: 'switch.turn_on',
    requested_services: ['switch.turn_on'],
    action_source: 'explicit',
    target_scope: 'specific',
    target_hints: ['coffee maker'],
    target_entity_ids: ['switch.coffee'],
    risk_level: 'low',
    confidence: 95,
    assumptions: [],
    questions: [],
    reason: 'The trigger, action, and target are explicit.',
    evidence: {
      trigger_phrase: 'When entrance motion is detected',
      action_phrase: 'turn on',
      target_phrase: 'coffee maker',
    },
    ...overrides,
  };
}

function draft(overrides = {}) {
  return {
    status: 'success',
    automation: {
      alias: 'Entrance coffee',
      triggers: [{ platform: 'state', entity_id: ['binary_sensor.entrance_motion'], from: 'off', to: 'on' }],
      conditions: [],
      actions: [{ service: 'switch.turn_on', target: { entity_id: ['switch.coffee'] }, data: {} }],
      ...overrides,
    },
  };
}

function options(outputs) {
  let index = 0;
  return {
    env: { LLM_PROVIDER: 'ollama', LLM_ENTITY_RETRIEVAL: 'lexical' },
    fetchImpl: async () => response(outputs[index++]),
    calls: () => index,
  };
}

test('conditional switch request follows generic goal, plan, validation pipeline', async () => {
  const mocks = options([goal(), draft()]);
  const result = await createAutomationDraft({
    command: 'When entrance motion is detected, turn on the coffee maker',
    entity_cards: cards,
    capability_context: capabilities,
    interaction_mode: 'auto',
  }, mocks);
  assert.equal(result.status, 'success');
  assert.equal(result.automation.actions[0].service, 'switch.turn_on');
  assert.equal(result.pipeline.goal_analysis.goal_category, 'appliance_routine');
  assert.equal(mocks.calls(), 2);
});

test('direct switch request becomes a grounded control intent without planning call', async () => {
  const mocks = options([goal({
    goal_type: 'immediate_control',
    trigger_specified: false,
    trigger_kind: 'none',
    evidence: { trigger_phrase: '', action_phrase: '켜줘', target_phrase: '커피 머신' },
    target_hints: ['커피 머신'],
  })]);
  const result = await createAutomationDraft({
    command: '커피 머신 켜줘',
    entity_cards: cards,
    capability_context: capabilities,
    interaction_mode: 'auto',
  }, mocks);
  assert.equal(result.status, 'control_intent');
  assert.equal(result.service, 'switch.turn_on');
  assert.deepEqual(result.candidate_entity_ids, ['switch.coffee']);
  assert.equal(mocks.calls(), 1);
});

test('time triggers are accepted when advertised by visual capabilities', async () => {
  const timeGoal = goal({
    trigger_kind: 'time',
    evidence: { trigger_phrase: 'At 7 AM', action_phrase: 'turn on', target_phrase: 'coffee maker' },
  });
  const mocks = options([timeGoal, draft({ triggers: [{ platform: 'time', at: '07:00:00' }] })]);
  const result = await createAutomationDraft({
    command: 'At 7 AM, turn on the coffee maker',
    entity_cards: cards,
    capability_context: capabilities,
  }, mocks);
  assert.equal(result.status, 'success');
  assert.equal(result.automation.triggers[0].platform, 'time');
});

test('an explicit conditional clause restores model-omitted trigger metadata without domain rules', async () => {
  const omitted = goal({
    trigger_specified: false,
    trigger_kind: 'none',
    evidence: { trigger_phrase: '', action_phrase: 'turn on', target_phrase: 'coffee maker' },
  });
  const mocks = options([omitted, draft()]);
  const result = await createAutomationDraft({
    command: 'When entrance motion is detected, turn on the coffee maker',
    entity_cards: cards,
    capability_context: capabilities,
  }, mocks);
  assert.equal(result.status, 'success');
  assert.equal(result.pipeline.goal_analysis.trigger_specified, true);
  assert.equal(mocks.calls(), 2);
});

test('risk is computed from registry data rather than the model category or claim', async () => {
  const climateGoal = goal({
    goal_type: 'immediate_control',
    goal_category: 'anything_the_model_calls_it',
    trigger_specified: false,
    trigger_kind: 'none',
    primary_service: 'climate.set_temperature',
    requested_services: ['climate.set_temperature'],
    target_hints: ['thermostat'],
    target_entity_ids: ['climate.bedroom'],
    risk_level: 'low',
    evidence: { trigger_phrase: '', action_phrase: 'set', target_phrase: 'thermostat' },
  });
  const mocks = options([climateGoal]);
  const result = await createAutomationDraft({
    command: 'Set the thermostat',
    entity_cards: cards,
    capability_context: capabilities,
    interaction_mode: 'auto',
  }, mocks);
  assert.equal(result.status, 'unsupported');
  assert.match(result.reason, /draft-only/);
  assert.equal(result.pipeline.goal_analysis.risk_level, 'medium');
});

test('vague action evidence is stopped before a service can be planned', async () => {
  const mocks = options([goal({
    trigger_specified: false,
    trigger_kind: 'none',
    action_source: 'explicit',
    evidence: { trigger_phrase: '', action_phrase: '뭔가', target_phrase: '거실 조명' },
    target_hints: ['거실 조명'],
    target_entity_ids: ['light.living_room'],
  })]);
  const result = await createAutomationDraft({
    command: '거실 조명으로 뭔가 해줘',
    entity_cards: cards,
    capability_context: capabilities,
  }, mocks);
  assert.equal(result.status, 'needs_clarification');
  assert.match(result.question, /구체적으로/);
});

test('inferred low-risk goal uses the same planner and grounded policy as explicit goals', async () => {
  const inferred = goal({
    trigger_specified: false,
    trigger_kind: 'none',
    primary_service: 'light.turn_off',
    requested_services: ['light.turn_off'],
    action_source: 'inferred',
    target_scope: 'unspecified',
    target_hints: [],
    target_entity_ids: [],
    assumptions: ['Turning off active lights is a reversible preparation step.'],
    evidence: { trigger_phrase: '', action_phrase: '', target_phrase: '' },
  });
  const mocks = options([inferred, draft({
    triggers: [],
    actions: [{ service: 'light.turn_off', target: { entity_id: ['light.living_room'] }, data: {} }],
  })]);
  const result = await createAutomationDraft({
    command: 'Prepare the home for sleep',
    entity_cards: cards,
    capability_context: capabilities,
  }, mocks);
  assert.equal(result.status, 'success');
  assert.equal(mocks.calls(), 2);
  assert.match(result.pipeline.policy_notes.join(' '), /compatible grounded entities/);
});

test('semantic validator rejects services and targets outside analyzed intent', () => {
  const result = validateSemanticAlignment(draft().automation, goal({
    requested_services: ['light.turn_off'],
    primary_service: 'light.turn_off',
  }), cards);
  assert.equal(result.aligned, false);
  assert.match(result.errors.join('\n'), /not supported by the analyzed user intent/);
});
