import assert from 'node:assert/strict';
import test from 'node:test';
import { createAssistantRequestRouter } from '../assistant_request_router.mjs';

function router(createDraft, overrides = {}) {
  return createAssistantRequestRouter({
    createDraft,
    previewControl: async () => ({
      status: 'ready_to_execute', execution_id: 'run-1', service: 'switch.turn_on',
      entity: { entity_id: 'switch.coffee', name: 'Coffee Maker' },
    }),
    executeControl: async () => ({
      status: 'success', service: 'switch.turn_on',
      entity: { entity_id: 'switch.coffee', display_name: 'Coffee Maker' }, target_count: 1,
    }),
    readInformation: async ({ entity_id }) => ({
      status: 'information_result', entity: { entity_id, display_name: 'Livingroom Light', state: 'on' },
    }),
    queryInformation: async ({ plan }) => {
      if (plan.operation === 'entity_collection') {
        return { status: 'success', kind: 'collection', aggregate: { kind: 'count', count: 4 } };
      }
      return {
        status: 'success', kind: 'property', property: 'state',
        entity: { entity_id: 'light.living_room', display_name: 'Livingroom Light', state: 'on' },
      };
    },
    ...overrides,
  });
}

test('routes one validated control plan and assigns success at the server boundary', async () => {
  const result = await router(async () => ({
    intent: 'control', plan: {
      operation: 'service_control', target: { selector: 'entity', entity_id: 'switch.coffee' },
      effect: { service: 'switch.turn_on', data: {} },
    }, validation: { valid: true },
  })).handle({ command: '커피 머신 켜줘' });
  assert.equal(result.intent, 'control');
  assert.equal(result.resolution.status, 'success');
  assert.equal(result.result.status, 'success');
});

test('routes a validated information plan to a read-only handler', async () => {
  const result = await router(async () => ({
    intent: 'information', plan: {
      operation: 'entity_property', target: { selector: 'entity', entity_id: 'light.living_room' },
      property: 'state', user_reference: '거실 조명',
    }, validation: { valid: true },
  })).handle({ command: '거실 조명 상태 알려줘', response_language: 'ko' });
  assert.equal(result.intent, 'information');
  assert.equal(result.resolution.status, 'success');
  assert.equal(result.result.entity.entity_id, 'light.living_room');
  assert.equal(result.message, '거실 조명은 현재 켜져 있습니다.');
});

test('uses an English request reference for an English information response', async () => {
  const result = await router(async () => ({
    intent: 'information', plan: {
      operation: 'entity_property', target: { selector: 'entity', entity_id: 'light.living_room' },
      property: 'state', user_reference: 'living room light',
    }, validation: { valid: true },
  })).handle({ command: 'What is the status of the living room light?', response_language: 'en' });
  assert.equal(result.message, 'Living room light is currently on.');
});

test('does not echo a model-created device reference that is absent from the request', async () => {
  const result = await router(async () => ({
    intent: 'information', plan: {
      operation: 'entity_property', target: { selector: 'entity', entity_id: 'light.living_room' },
      property: 'state', user_reference: '거실 메인등',
    }, validation: { valid: true },
  })).handle({ command: '거실 조명 상태 알려줘', response_language: 'ko' });
  assert.equal(result.message, 'Livingroom Light: 켜져 있습니다');
});

test('returns ambiguous with server-owned candidate display data', async () => {
  const result = await router(async () => ({
    status: 'needs_confirmation', resolution_key: 'livingroomlight',
    candidates: [{ entity_id: 'light.main', name: 'Main Light', area: 'living_room', domain: 'light', state: 'on' }],
  })).handle({ command: '거실 조명 켜줘' });
  assert.equal(result.resolution.status, 'ambiguous');
  assert.equal(result.candidates[0].display_name, 'Main Light');
  assert.equal(result.candidates[0].candidate_id, 'light.main');
});

test('maps live entity validation failure to entity_not_found', async () => {
  const result = await router(async () => ({
    intent: 'control', plan: { operation: 'service_control', target: { selector: 'entity', entity_id: 'fan.study' }, effect: { service: 'fan.turn_on', data: {} } },
    validation: { valid: false, errors: ['The control entity is outside Home Assistant context: fan.study'] },
  })).handle({ command: '서재 공기청정기를 켜줘', response_language: 'ko' });
  assert.equal(result.resolution.status, 'failed');
  assert.equal(result.resolution.failure_reason, 'entity_not_found');
  assert.equal(result.message_key, 'entity_not_found');
  assert.match(result.message, /Study/);
  assert.equal(result.message.includes('fan.study'), false);
});

test('maps a model grounding abstention to server-owned entity_not_found', async () => {
  const result = await router(async () => ({
    intent: 'information',
    plan: {
      operation: 'entity_property',
      target: { selector: 'unresolved', reference: 'study air purifier' },
      property: 'state', user_reference: 'study air purifier',
    },
    validation: { valid: true },
  })).handle({ command: 'What is the study air purifier status?', response_language: 'en' });
  assert.equal(result.resolution.status, 'failed');
  assert.equal(result.resolution.failure_reason, 'entity_not_found');
});

test('does not execute a multi-device control plan without explicit collection evidence', async () => {
  let previewed = false;
  const result = await router(async () => ({
    intent: 'control',
    plan: {
      operation: 'service_control',
      target: { selector: 'entity_filter', filter: { domain: 'light' } },
      effect: { service: 'light.turn_on', data: {} },
    }, validation: { valid: true },
  }), { previewControl: async () => { previewed = true; return {}; } }).handle({
    command: 'Turn on the light.', response_language: 'en',
  });
  assert.equal(result.resolution.failure_reason, 'invalid_request');
  assert.equal(previewed, false);
});

test('requires user selection when live grounding scores leave a target ambiguous', async () => {
  let previewed = false;
  const createDraft = async () => ({
    intent: 'control',
    plan: {
      operation: 'service_control',
      target: { selector: 'entity', entity_id: 'light.room' },
      effect: { service: 'light.turn_on', data: {} }, user_reference: 'light',
    },
    validation: { valid: true },
    _grounding_assessment: {
      status: 'ambiguous', reference: 'light', margin: 0.004, minimum_margin: 0.02,
      candidates: [
        { entity_id: 'light.room', name: 'Room Light', domain: 'light' },
        { entity_id: 'light.kitchen', name: 'Kitchen Light', domain: 'light' },
      ],
    },
  });
  const instance = router(createDraft, { previewControl: async () => { previewed = true; return {}; } });
  const result = await instance.handle({ command: 'Turn on the light.', response_language: 'en' });
  assert.equal(result.resolution.status, 'ambiguous');
  assert.equal(result.candidates.length, 2);
  assert.equal(previewed, false);
});

test('formats server-owned outcome messages in the requested language', async () => {
  const result = await router(async () => ({
    intent: 'control', plan: { operation: 'service_control', target: { selector: 'entity', entity_id: 'fan.study' }, effect: { service: 'fan.turn_on', data: {} } },
    validation: { valid: false, errors: ['The control entity is outside Home Assistant context: fan.study'] },
  })).handle({ command: 'Turn on the study air purifier', response_language: 'en' });
  assert.equal(result.message_key, 'entity_not_found');
  assert.match(result.message, /requested Study/);
  assert.equal(result.message.includes('fan.study'), false);
});

test('maps a live capability validation failure to unsupported_capability', async () => {
  const result = await router(async () => ({
    intent: 'control', plan: { operation: 'service_control', target: { selector: 'entity', entity_id: 'light.livingroom' }, effect: { service: 'light.turn_on', data: {} } },
    validation: { valid: false, errors: ['The control service light.turn_on is not supported by light.livingroom'] },
  })).handle({ command: '거실 조명을 켜줘' });
  assert.equal(result.resolution.status, 'failed');
  assert.equal(result.resolution.failure_reason, 'unsupported_capability');
});

test('maps missing semantic fields to invalid_request', async () => {
  const result = await router(async () => ({
    intent: 'control', plan: {}, missing_fields: ['target'], validation: { valid: true },
  })).handle({ command: '켜줘' });
  assert.equal(result.resolution.failure_reason, 'invalid_request');
});

test('rejects a contextual target when it differs from the server-confirmed referent', async () => {
  const result = await router(async () => ({
    intent: 'control',
    plan: {
      operation: 'service_control',
      target: {
        selector: 'entity', entity_id: 'lock.front_door', context_source: 'last_confirmed_target',
      },
      effect: { service: 'lock.unlock', data: {} },
    },
    validation: { valid: true },
  })).handle({
    command: '열어줘',
    interaction_context: {
      last_confirmed_target: { entity_id: 'lock.gas_valve', source: 'information_query' },
    },
  });
  assert.equal(result.resolution.status, 'failed');
  assert.equal(result.resolution.failure_reason, 'invalid_request');
});

test('does not reuse a previous target without explicit prior-target evidence', async () => {
  const result = await router(async () => ({
    intent: 'control',
    plan: {
      operation: 'service_control',
      target: {
        selector: 'entity', entity_id: 'light.livingroom', context_source: 'last_confirmed_target',
      },
      effect: { service: 'light.turn_off', data: {} },
    },
    validation: { valid: true },
  })).handle({
    command: 'Turn off the light.',
    interaction_context: {
      last_confirmed_target: { entity_id: 'light.livingroom', source: 'executed_control' },
    },
  });
  assert.equal(result.resolution.status, 'failed');
  assert.equal(result.resolution.failure_reason, 'invalid_request');
});

test('reuses a previous target only with verified prior-target evidence', async () => {
  const result = await router(async () => ({
    intent: 'control',
    plan: {
      operation: 'service_control',
      target: {
        selector: 'entity', entity_id: 'light.livingroom', context_source: 'last_confirmed_target',
        context_evidence: 'the light I just turned on',
      },
      effect: { service: 'light.turn_off', data: {} },
    },
    validation: { valid: true },
  })).handle({
    command: 'Turn off the light I just turned on.',
    interaction_context: {
      last_confirmed_target: { entity_id: 'light.livingroom', source: 'executed_control' },
    },
  });
  assert.equal(result.resolution.status, 'success');
});

test('routes aggregate information without a model-generated answer', async () => {
  const result = await router(async () => ({
    intent: 'information', plan: {
      operation: 'entity_collection', target: { selector: 'entity_filter', filter: { domain: 'fan' } },
      projection: ['display_name'], aggregation: 'count',
    }, validation: { valid: true },
  })).handle({ command: '팬이 몇 개야?' });
  assert.equal(result.resolution.status, 'success');
  assert.equal(result.result.aggregate.count, 4);
});


test('routes a validated goal automation through the draft path without executing devices', async () => {
  let controlled = false;
  const instance = router(async () => ({
    intent: 'routine',
    plan: {
      operation: 'automation_generation',
      goal: 'prepare_for_sleep',
      yaml: 'alias: Sleep Preparation\\ntriggers: []\\nconditions: []\\nactions: []',
    },
    automation: {
      alias: 'Sleep Preparation',
      triggers: [{
        trigger: 'event',
        event_type: 'smartblock_goal_requested',
        event_data: { goal_id: 'prepare_for_sleep' },
      }],
      conditions: [],
      actions: [{ action: 'light.turn_off', target: { entity_id: 'light.bedroom' } }],
    },
    validation: { valid: true, schema_valid: true, grounded: true, capability_valid: true, errors: [] },
  }), {
    previewControl: async () => { controlled = true; throw new Error('Unexpected device preview'); },
  });
  const response = await instance.handle({ command: 'Prepare for sleep', response_language: 'en' });
  assert.equal(response.intent, 'routine');
  assert.equal(response.resolution.status, 'success');
  assert.equal(response.result.kind, 'automation');
  assert.equal(response.result.goal, 'prepare_for_sleep');
  assert.equal(response.result.automation.triggers[0].event_data.goal_id, 'prepare_for_sleep');
  assert.equal(controlled, false);
});

test('does not invent an automation when a goal has no verified device actions', async () => {
  const response = await router(async () => ({
    intent: 'routine',
    plan: { operation: 'goal_plan', goal: 'prepare_for_sleep' },
    missing_fields: [],
    validation: { valid: true, errors: [] },
  })).handle({ command: 'Prepare for sleep', response_language: 'en' });
  assert.equal(response.resolution.status, 'failed');
  assert.equal(response.resolution.failure_reason, 'no_grounded_goal_actions');
  assert.equal(response.result.kind, 'goal_plan');
});


test('reports a confirmed observed state instead of a generic completion', async () => {
  const response = await router(async () => ({
    intent: 'control',
    plan: {
      operation: 'service_control',
      target: { selector: 'entity', entity_id: 'light.bedroom' },
      effect: { service: 'light.turn_off', data: {} },
    },
    validation: { valid: true, errors: [] },
  }), {
    executeControl: async () => ({
      status: 'success', service: 'light.turn_off',
      entity: { entity_id: 'light.bedroom', display_name: 'Bedroom Light' },
      target_count: 1,
      verification: { status: 'confirmed', observed: [{ entity_id: 'light.bedroom', state: 'off' }] },
    }),
  }).handle({ command: 'Turn off the bedroom light', response_language: 'en' });
  assert.equal(response.message, 'Bedroom Light is now off.');
});

test('does not claim an unverified device state', async () => {
  const response = await router(async () => ({
    intent: 'control',
    plan: {
      operation: 'service_control',
      target: { selector: 'entity', entity_id: 'light.bedroom' },
      effect: { service: 'light.turn_off', data: {} },
    },
    validation: { valid: true, errors: [] },
  }), {
    executeControl: async () => ({
      status: 'success', service: 'light.turn_off',
      entity: { entity_id: 'light.bedroom', display_name: 'Bedroom Light' },
      target_count: 1,
      verification: { status: 'not_confirmed', observed: [{ entity_id: 'light.bedroom', state: 'on' }] },
    }),
  }).handle({ command: 'Turn off the bedroom light', response_language: 'en' });
  assert.match(response.message, /could not confirm the resulting state/);
  assert.doesNotMatch(response.message, /is now off/);
});
