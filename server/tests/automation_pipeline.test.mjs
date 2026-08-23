import test from 'node:test';
import assert from 'node:assert/strict';

import { createAutomationDraft } from '../llm_draft_service.mjs';
import {
  applyConservativeDraftPolicy,
  validateSemanticAlignment,
} from '../automation_goal_analyzer.mjs';

const cards = [
  {
    entity_id: 'binary_sensor.entrance_motion',
    friendly_name: '현관 움직임',
    domain: 'binary_sensor',
    state: 'off',
    device_class: 'motion',
    area: '현관',
    supported_actions: [],
  },
  {
    entity_id: 'light.living_room',
    friendly_name: '거실 조명',
    domain: 'light',
    state: 'on',
    area: '거실',
    supported_actions: ['light.turn_on', 'light.turn_off'],
  },
];

function ollamaResponse(output) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ model: 'gemma3:4b', message: { content: JSON.stringify(output) } }),
    text: async () => '',
  };
}

function readyAnalysis(service = 'light.turn_off') {
  return {
    status: 'ready',
    goal_type: 'automation_creation',
    goal_category: 'lighting',
    home_supports_goal: true,
    trigger_specified: true,
    trigger_kind: 'state',
    primary_service: service,
    requested_services: [service],
    action_source: 'explicit',
    target_scope: 'specific',
    target_hints: ['거실 조명'],
    target_entity_ids: ['light.living_room'],
    risk_level: 'low',
    confidence: 95,
    assumptions: [],
    questions: [],
    reason: '명시적인 상태 trigger와 조명 동작이 있다.',
    evidence: {
      trigger_phrase: '현관 움직임이 감지되면',
      action_phrase: service === 'light.turn_off' ? '꺼줘' : '켜줘',
      target_phrase: '거실 조명',
    },
  };
}

test('abstract bedtime goal produces a conservative manual light-off draft without questions', async () => {
  let calls = 0;
  const result = await createAutomationDraft({
    command: '잠들 준비를 해줘',
    entity_cards: cards,
  }, {
    env: { LLM_PROVIDER: 'ollama', LLM_ENABLE_FAST_PATH: 'false' },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return ollamaResponse({
        status: 'ready',
        goal_type: 'automation_creation',
        goal_category: 'sleep_preparation',
        home_supports_goal: true,
        trigger_specified: false,
        trigger_kind: 'none',
        primary_service: 'light.turn_off',
        requested_services: ['light.turn_off'],
        action_source: 'inferred',
        target_scope: 'unspecified',
        target_hints: [],
        target_entity_ids: [],
        risk_level: 'low',
        confidence: 80,
        assumptions: ['현재 켜진 일반 조명을 끄는 수동 실행 초안으로 해석했다.'],
        questions: [],
        reason: '저위험이며 미리보기에서 수정할 수 있는 취침 준비 초안이다.',
        evidence: { trigger_phrase: '', action_phrase: '', target_phrase: '' },
      });
      return ollamaResponse({
        status: 'success',
        automation: {
          alias: '취침 준비',
          triggers: [],
          conditions: [],
          actions: [{
            service: 'light.turn_off',
            target: { entity_id: ['light.living_room'] },
            data: {},
          }],
        },
      });
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.status, 'success');
  assert.equal(result.pipeline.stage, 'complete');
  assert.equal(typeof result.pipeline.timings_ms.goal_analysis, 'number');
  assert.equal(result.pipeline.goal_analysis.goal_category, 'sleep_preparation');
  assert.equal(result.automation.triggers.length, 0);
  assert.equal(result.automation.actions[0].service, 'light.turn_off');
  assert.match(result.pipeline.goal_analysis.assumptions.join('\n'), /수동 실행/);
});

test('inferred bedtime goal discards model-invented evidence and targets', async () => {
  const result = await createAutomationDraft({
    command: '잠들 준비를 해줘',
    entity_cards: cards,
  }, {
    env: { LLM_PROVIDER: 'ollama' },
    fetchImpl: async () => ollamaResponse({
      status: 'ready',
      goal_type: 'automation_creation',
      goal_category: 'sleep_preparation',
      home_supports_goal: true,
      trigger_specified: false,
      trigger_kind: 'none',
      primary_service: 'light.turn_off',
      requested_services: ['light.turn_off'],
      action_source: 'inferred',
      target_scope: 'specific',
      target_hints: ['거실 조명'],
      target_entity_ids: ['light.living_room'],
      risk_level: 'low',
      confidence: 80,
      assumptions: ['현재 켜진 조명을 끈다.'],
      questions: [],
      reason: '취침 준비를 위한 저위험 조명 초안이다.',
      evidence: {
        trigger_phrase: '',
        action_phrase: '조명을 끈다',
        target_phrase: '거실 조명',
      },
    }),
  });

  assert.equal(result.status, 'success');
  assert.deepEqual(result.automation.actions[0].target.entity_id, ['light.living_room']);
  assert.equal(result.pipeline.goal_analysis.evidence.action_phrase, '');
  assert.equal(result.pipeline.goal_analysis.evidence.target_phrase, '');
  assert.deepEqual(result.pipeline.goal_analysis.target_hints, []);
});

test('inferred bedtime goal rejects a target that does not match the mentioned room', async () => {
  const bedroomCard = {
    entity_id: 'light.bedroom',
    friendly_name: '침실 조명',
    domain: 'light',
    state: 'on',
    area: '침실',
    supported_actions: ['light.turn_on', 'light.turn_off'],
  };
  let calls = 0;
  const result = await createAutomationDraft({
    command: '침실에서 잠들 준비를 해줘',
    entity_cards: [...cards, bedroomCard],
  }, {
    env: { LLM_PROVIDER: 'ollama', LLM_ENABLE_FAST_PATH: 'false' },
    fetchImpl: async () => {
      calls += 1;
      return ollamaResponse({
        status: 'ready',
        goal_type: 'automation_creation',
        goal_category: 'sleep_preparation',
        home_supports_goal: true,
        trigger_specified: false,
        trigger_kind: 'none',
        primary_service: 'light.turn_off',
        requested_services: ['light.turn_off'],
        action_source: 'inferred',
        target_scope: 'specific',
        target_hints: [],
        target_entity_ids: ['light.living_room'],
        risk_level: 'low',
        confidence: 80,
        assumptions: ['현재 켜진 조명을 끈다.'],
        questions: [],
        reason: '취침 준비를 위한 저위험 조명 초안이다.',
        evidence: { trigger_phrase: '', action_phrase: '', target_phrase: '' },
      });
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.status, 'failure');
  assert.match(result.error, /Goal analysis failed local validation/);
  assert.deepEqual(result.validation.errors, [
    'A specific target requires a grounded target hint or entity ID.',
  ]);
});

test('unspecified inferred lighting action becomes a clarification', async () => {
  const result = await createAutomationDraft({
    command: '거실 조명으로 뭔가 해줘',
    entity_cards: cards,
  }, {
    env: { LLM_PROVIDER: 'ollama' },
    fetchImpl: async () => ollamaResponse({
      ...readyAnalysis('light.turn_off'),
      trigger_specified: false,
      trigger_kind: 'none',
      action_source: 'inferred',
      assumptions: ['조명을 끄는 것으로 추론했다.'],
      evidence: { trigger_phrase: '', action_phrase: '', target_phrase: '거실 조명' },
    }),
  });

  assert.equal(result.status, 'needs_clarification');
  assert.match(result.question, /켤까요, 끌까요/);
});

test('sleep preparation inference requires sleep-related user wording', async () => {
  let calls = 0;
  const result = await createAutomationDraft({
    command: '거실 조명으로 뭔가 해줘',
    entity_cards: cards,
  }, {
    env: { LLM_PROVIDER: 'ollama', LLM_ENABLE_FAST_PATH: 'false' },
    fetchImpl: async () => {
      calls += 1;
      return ollamaResponse({
        ...readyAnalysis('light.turn_off'),
        goal_category: 'sleep_preparation',
        trigger_specified: false,
        trigger_kind: 'none',
        action_source: 'inferred',
        assumptions: ['취침 준비로 추론했다.'],
        evidence: { trigger_phrase: '', action_phrase: '', target_phrase: '거실 조명' },
      });
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.goal_analysis.action_source, 'unknown');
  assert.match(result.question, /켤까요, 끌까요/);
});

test('model-claimed explicit action without user action evidence becomes a clarification', async () => {
  let calls = 0;
  const result = await createAutomationDraft({
    command: '거실 조명으로 뭔가 해줘',
    entity_cards: cards,
  }, {
    env: { LLM_PROVIDER: 'ollama', LLM_ENABLE_FAST_PATH: 'false' },
    fetchImpl: async () => {
      calls += 1;
      return ollamaResponse({
        ...readyAnalysis('light.turn_off'),
        trigger_specified: false,
        trigger_kind: 'none',
        action_source: 'explicit',
        evidence: { trigger_phrase: '', action_phrase: '뭔가 해줘', target_phrase: '거실 조명' },
      });
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.goal_analysis.action_source, 'unknown');
  assert.match(result.question, /켤까요, 끌까요/);
});

test('unsupported climate goal cannot be coerced into a lighting plan', async () => {
  let calls = 0;
  const result = await createAutomationDraft({
    command: '현관 움직임이 감지되면 에어컨을 켜줘',
    entity_cards: cards,
  }, {
    env: { LLM_PROVIDER: 'ollama' },
    fetchImpl: async () => {
      calls += 1;
      return ollamaResponse({
        ...readyAnalysis('light.turn_on'),
        goal_category: 'climate',
        target_hints: ['에어컨'],
        target_entity_ids: [],
        evidence: {
          trigger_phrase: '현관 움직임이 감지되면',
          action_phrase: '켜줘',
          target_phrase: '에어컨',
        },
      });
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.status, 'unsupported');
  assert.match(result.reason, /조명 켜기와 끄기/);
});

test('ready goal proceeds to a grounded light-off automation plan', async () => {
  let calls = 0;
  const result = await createAutomationDraft({
    command: '현관 움직임이 감지되면 거실 조명을 꺼줘',
    entity_cards: cards,
  }, {
    env: { LLM_PROVIDER: 'ollama' },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return ollamaResponse(readyAnalysis());
      return ollamaResponse({
        status: 'success',
        automation: {
          alias: '현관 움직임 감지 시 거실 조명 끄기',
          triggers: [{
            platform: 'state',
            entity_id: ['binary_sensor.entrance_motion'],
            from: 'off',
            to: 'on',
          }],
          conditions: [],
          actions: [{
            service: 'light.turn_off',
            target: { entity_id: ['light.living_room'] },
            data: {},
          }],
        },
      });
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.status, 'success');
  assert.equal(result.automation.actions[0].service, 'light.turn_off');
  assert.equal(result.semantic_validation.aligned, true);
  assert.equal(result.pipeline.stage, 'complete');
  assert.equal(typeof result.pipeline.timings_ms.planning, 'number');
});

test('explicit state trigger evidence repairs inconsistent model trigger fields locally', async () => {
  let calls = 0;
  const result = await createAutomationDraft({
    command: '현관 움직임이 감지되면 거실 조명을 꺼줘',
    entity_cards: cards,
  }, {
    env: { LLM_PROVIDER: 'ollama' },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return ollamaResponse({
          ...readyAnalysis(),
          trigger_specified: false,
          trigger_kind: 'none',
          evidence: { ...readyAnalysis().evidence, trigger_phrase: '' },
        });
      }
      return ollamaResponse({
        status: 'success',
        automation: {
          alias: '현관 움직임 감지 시 거실 조명 끄기',
          triggers: [{
            platform: 'state',
            entity_id: ['binary_sensor.entrance_motion'],
            from: 'off',
            to: 'on',
          }],
          conditions: [],
          actions: [{
            service: 'light.turn_off',
            target: { entity_id: ['light.living_room'] },
            data: {},
          }],
        },
      });
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.status, 'success');
  assert.equal(result.pipeline.goal_analysis.trigger_specified, true);
  assert.equal(result.pipeline.goal_analysis.trigger_kind, 'state');
  assert.equal(
    result.pipeline.goal_analysis.evidence.trigger_phrase,
    '현관 움직임이 감지되면',
  );
});

test('a blocking ambiguity returns at most one clarification question', async () => {
  const result = await createAutomationDraft({
    command: '조명으로 뭔가 해줘',
    entity_cards: cards,
  }, {
    env: { LLM_PROVIDER: 'ollama' },
    fetchImpl: async () => ollamaResponse({
      status: 'needs_clarification',
      goal_type: 'automation_creation',
      goal_category: 'lighting',
      home_supports_goal: true,
      trigger_specified: false,
      trigger_kind: 'none',
      primary_service: 'none',
      requested_services: [],
      action_source: 'unknown',
      target_scope: 'unspecified',
      target_hints: [],
      target_entity_ids: [],
      risk_level: 'low',
      confidence: 20,
      assumptions: [],
      questions: ['조명을 켤까요, 끌까요?'],
      reason: '동작 방향을 결정할 수 없다.',
      evidence: { trigger_phrase: '', action_phrase: '', target_phrase: '조명' },
    }),
  });

  assert.equal(result.status, 'needs_clarification');
  assert.deepEqual(result.questions, ['조명을 켤까요, 끌까요?']);
});

test('an internally inconsistent ready analysis is repaired before asking the user', async () => {
  let calls = 0;
  const inferredGoal = {
    status: 'ready',
    goal_type: 'automation_creation',
    goal_category: 'sleep_preparation',
    home_supports_goal: true,
    trigger_specified: false,
    trigger_kind: 'none',
    primary_service: 'none',
    requested_services: [],
    action_source: 'inferred',
    target_scope: 'unspecified',
    target_hints: [],
    target_entity_ids: [],
    risk_level: 'low',
    confidence: 80,
    assumptions: ['현재 켜진 조명을 끈다.'],
    questions: [],
    reason: '취침 준비를 위해 현재 켜진 조명을 끈다.',
    evidence: { trigger_phrase: '', action_phrase: '', target_phrase: '' },
  };
  const result = await createAutomationDraft({
    command: '잠들 준비를 해줘',
    entity_cards: cards,
  }, {
    env: { LLM_PROVIDER: 'ollama' },
    fetchImpl: async (_url, request) => {
      calls += 1;
      const body = JSON.parse(request.body);
      if (calls === 1) return ollamaResponse(inferredGoal);
      if (calls === 2) {
        assert.match(body.messages.at(-1).content, /requested_services/);
        return ollamaResponse({
          ...inferredGoal,
          primary_service: 'light.turn_off',
          requested_services: ['light.turn_off'],
        });
      }
      throw new Error('planner should not be called for a low-risk inferred draft');
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.status, 'success');
  assert.equal(result.automation.actions[0].service, 'light.turn_off');
});

test('semantic feedback rejects an action not justified by analyzed intent', () => {
  const validation = validateSemanticAlignment({
    actions: [{ service: 'light.turn_on' }],
  }, readyAnalysis('light.turn_off'));

  assert.equal(validation.aligned, false);
  assert.match(validation.errors.join('\n'), /not supported by the analyzed user intent/);
});

test('conservative policy removes invented triggers and targets only lights that are on', () => {
  const analysis = {
    ...readyAnalysis('light.turn_off'),
    trigger_specified: false,
    trigger_kind: 'none',
    inferred_action: true,
    assumptions: ['현재 켜진 조명을 끈다.'],
  };
  const result = applyConservativeDraftPolicy({
    triggers: [{
      platform: 'state',
      entity_id: ['binary_sensor.entrance_motion'],
      to: 'on',
    }],
    conditions: [],
    actions: [{
      service: 'light.turn_off',
      target: { entity_id: ['light.already_off'] },
      data: {},
    }],
  }, analysis, [
    ...cards,
    {
      entity_id: 'light.already_off',
      friendly_name: '꺼진 조명',
      domain: 'light',
      state: 'off',
      supported_actions: ['light.turn_on', 'light.turn_off'],
    },
  ]);

  assert.deepEqual(result.automation.triggers, []);
  assert.deepEqual(
    result.automation.actions[0].target.entity_id,
    ['light.living_room'],
  );
  assert.match(result.notes.join('\n'), /Removed a trigger/);
});

test('conservative policy uses supported lights for a reusable draft when all are off', () => {
  const offCards = cards.map((card) => ({ ...card, state: 'off' }));
  const analysis = {
    ...readyAnalysis('light.turn_off'),
    trigger_specified: false,
    trigger_kind: 'none',
    inferred_action: true,
    assumptions: ['취침 준비용 수동 초안이다.'],
  };
  const result = applyConservativeDraftPolicy({
    triggers: [],
    conditions: [],
    actions: [],
  }, analysis, offCards);

  assert.deepEqual(result.automation.actions[0].target.entity_id, ['light.living_room']);
  assert.match(result.notes.join('\n'), /reusable draft/);
});

test('explicit Korean light-on wording repairs inferred evidence before planning', async () => {
  let calls = 0;
  const base = {
    ...readyAnalysis('light.turn_on'),
    trigger_specified: false,
    trigger_kind: 'none',
    target_scope: 'specific',
    target_hints: ['거실'],
    assumptions: ['사용자가 조명을 켜고 싶어 한다.'],
    evidence: { trigger_phrase: '', action_phrase: '', target_phrase: '거실' },
  };
  const result = await createAutomationDraft({
    command: '거실 조명을 켜줘',
    conversation: [{ role: 'user', content: '거실 조명을 켜줘' }],
    entity_cards: cards,
  }, {
    env: { LLM_PROVIDER: 'ollama', LLM_ENABLE_FAST_PATH: 'false' },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return ollamaResponse({ ...base, action_source: 'inferred' });
      if (calls === 2) {
        return ollamaResponse({
          ...base,
          action_source: 'explicit',
          assumptions: [],
          evidence: { ...base.evidence, action_phrase: '켜줘' },
        });
      }
      return ollamaResponse({
        status: 'success',
        automation: {
          alias: '거실 조명 켜기',
          triggers: [],
          conditions: [],
          actions: [{
            service: 'light.turn_on',
            target: { entity_id: ['light.living_room'] },
            data: {},
          }],
        },
      });
    },
  });

  assert.equal(calls, 3);
  assert.equal(result.status, 'success');
  assert.equal(result.pipeline.goal_analysis.inferred_action, false);
  assert.equal(result.pipeline.goal_analysis.evidence.trigger_phrase, '');
  assert.equal(result.automation.actions[0].service, 'light.turn_on');
});

test('malformed goal output is rejected after one local-schema repair attempt', async () => {
  let calls = 0;
  const result = await createAutomationDraft({
    command: '거실 조명을 켜줘',
    entity_cards: cards,
  }, {
    env: { LLM_PROVIDER: 'ollama', LLM_ENABLE_FAST_PATH: 'false' },
    fetchImpl: async () => {
      calls += 1;
      return ollamaResponse({
        status: 'ready',
        trigger_specified: false,
        trigger_kind: 'none',
        primary_service: 'light.turn_on',
        requested_services: ['light.turn_on'],
      });
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.status, 'failure');
  assert.match(result.error, /local validation/);
  assert.equal(result.pipeline.stage, 'goal_analysis');
});

test('specific inferred target never expands to another room', () => {
  const result = applyConservativeDraftPolicy({
    triggers: [],
    conditions: [],
    actions: [],
  }, {
    inferred_action: true,
    trigger_specified: false,
    requested_services: ['light.turn_off'],
    target_scope: 'specific',
    target_hints: ['거실'],
  }, [
    ...cards,
    {
      entity_id: 'light.bedroom',
      friendly_name: '침실 조명',
      domain: 'light',
      state: 'on',
      area: '침실',
      supported_actions: ['light.turn_on', 'light.turn_off'],
    },
  ]);

  assert.deepEqual(result.automation.actions[0].target.entity_id, ['light.living_room']);
});

test('an explicit manual light command uses the grounded fast path without Ollama', async () => {
  let calls = 0;
  const result = await createAutomationDraft({
    command: '거실 불을 켜줘',
    entity_cards: cards,
  }, {
    env: { LLM_PROVIDER: 'ollama' },
    fetchImpl: async () => {
      calls += 1;
      throw new Error('Ollama should not be called for a unique explicit manual light target.');
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.status, 'success');
  assert.equal(result.provider, 'local-fast-path');
  assert.equal(result.pipeline.mode, 'explicit_manual_light_fast_path');
  assert.deepEqual(result.pipeline.ollama_calls, []);
  assert.deepEqual(result.automation.triggers, []);
  assert.equal(result.automation.actions[0].service, 'light.turn_on');
  assert.deepEqual(result.automation.actions[0].target.entity_id, ['light.living_room']);
});

test('an explicit manual light command with no target confirms every supported light locally', async () => {
  const extraLight = {
    entity_id: 'light.bedroom',
    friendly_name: 'Bedroom Light',
    domain: 'light',
    state: 'off',
    area: 'Bedroom',
    supported_actions: ['light.turn_on', 'light.turn_off'],
  };
  const result = await createAutomationDraft({
    command: 'Turn on a light',
    entity_cards: [...cards, extraLight],
  }, {
    env: { LLM_PROVIDER: 'ollama' },
    fetchImpl: async () => {
      throw new Error('Ollama must not be called for local target confirmation.');
    },
  });

  assert.equal(result.status, 'needs_confirmation');
  assert.equal(result.provider, 'local-fast-path');
  assert.equal(result.role, 'action');
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.entity_id).sort(),
    ['light.bedroom', 'light.living_room'],
  );
  assert.equal(result.pipeline.mode, 'explicit_manual_light_fast_path');
});

test('trigger language bypasses the manual fast path and preserves two-stage planning', async () => {
  let calls = 0;
  const result = await createAutomationDraft({
    command: '현관 움직임이 감지되면 거실 조명을 꺼줘',
    entity_cards: cards,
  }, {
    env: { LLM_PROVIDER: 'ollama' },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return ollamaResponse(readyAnalysis());
      return ollamaResponse({
        status: 'success',
        automation: {
          alias: '현관 움직임 감지 시 거실 조명 끄기',
          triggers: [{
            platform: 'state',
            entity_id: ['binary_sensor.entrance_motion'],
            from: 'off',
            to: 'on',
          }],
          conditions: [],
          actions: [{
            service: 'light.turn_off',
            target: { entity_id: ['light.living_room'] },
            data: {},
          }],
        },
      });
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.status, 'success');
  assert.equal(result.pipeline.mode, undefined);
});
