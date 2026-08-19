import test from 'node:test';
import assert from 'node:assert/strict';

import { createOllamaAutomationDraft } from '../llm_draft_service.mjs';
import {
  OLLAMA_DRAFT_RESPONSE_SCHEMA,
  selectOllamaEntityContext,
} from '../ollama_automation_provider.mjs';

const cards = [
  {
    entity_id: 'binary_sensor.entrance_motion',
    friendly_name: '현관 움직임',
    domain: 'binary_sensor',
    state: 'off',
    device_class: 'motion',
    area: '현관',
  },
  {
    entity_id: 'light.living_room',
    friendly_name: '거실 조명',
    domain: 'light',
    state: 'off',
    area: '거실',
    supported_actions: ['light.turn_on', 'light.turn_off'],
  },
  {
    entity_id: 'sensor.private_debug_value',
    friendly_name: '보내지 않을 센서',
    domain: 'sensor',
    state: 'secret-like-value',
  },
];

function automation(actionEntity = 'light.living_room') {
  return {
    alias: '현관 움직임 감지 시 거실 조명 켜기',
    triggers: [{
      platform: 'state',
      entity_id: ['binary_sensor.entrance_motion'],
      from: 'off',
      to: 'on',
    }],
    conditions: [],
    actions: [{
      service: 'light.turn_on',
      target: { entity_id: [actionEntity] },
      data: {},
    }],
  };
}

function ollamaResponse(output) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      model: 'qwen3:4b',
      message: { content: JSON.stringify(output) },
      total_duration: 2_000_000_000,
      load_duration: 100_000_000,
      prompt_eval_count: 200,
      prompt_eval_duration: 800_000_000,
      eval_count: 20,
      eval_duration: 1_000_000_000,
    }),
    text: async () => '',
  };
}

test('Ollama context keeps only entities compatible with the current MVP', () => {
  const selected = selectOllamaEntityContext('현관 움직임이면 거실 조명을 켜줘', cards, 10);
  assert.deepEqual(
    new Set(selected.map((card) => card.entity_id)),
    new Set(['binary_sensor.entrance_motion', 'light.living_room']),
  );
  assert.equal(selected.some((card) => card.state === 'secret-like-value'), false);
});

test('Ollama provider requests schema-constrained output and validates the draft', async () => {
  let requestBody;
  const result = await createOllamaAutomationDraft({
    command: '현관 움직임이 감지되면 거실 조명을 켜줘',
    entity_cards: cards,
  }, {
    env: { OLLAMA_MODEL: 'qwen3:4b' },
    fetchImpl: async (_url, request) => {
      requestBody = JSON.parse(request.body);
      return ollamaResponse({ status: 'success', automation: automation() });
    },
  });

  assert.equal(result.status, 'success');
  assert.equal(result.provider, 'ollama');
  assert.equal(result.model, 'qwen3:4b');
  assert.deepEqual(result.validation.errors, []);
  assert.deepEqual(requestBody.format, OLLAMA_DRAFT_RESPONSE_SCHEMA);
  assert.equal(requestBody.options.temperature, 0);
  assert.equal(requestBody.stream, false);
  assert.equal(requestBody.keep_alive, '30m');
  assert.equal(result.ollama_calls[0].total_ms, 2000);
  assert.equal(result.ollama_calls[0].prompt_tokens, 200);
});

test('Ollama provider repairs one hallucinated entity before accepting output', async () => {
  let calls = 0;
  const result = await createOllamaAutomationDraft({
    command: '현관 움직임이 감지되면 거실 조명을 켜줘',
    entity_cards: cards,
  }, {
    env: {},
    fetchImpl: async (_url, request) => {
      calls += 1;
      const body = JSON.parse(request.body);
      if (calls === 2) {
        assert.match(body.messages.at(-1).content, /Unknown action entity/);
      }
      return ollamaResponse({
        status: 'success',
        automation: automation(calls === 1 ? 'light.hallucinated' : 'light.living_room'),
      });
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.status, 'success');
  assert.equal(result.automation.actions[0].target.entity_id[0], 'light.living_room');
});

test('Ollama provider rejects unsupported configuration fields through MVP validation', async () => {
  const invalid = automation();
  invalid.conditions.push({ condition: 'state', entity_id: 'binary_sensor.entrance_motion' });

  const result = await createOllamaAutomationDraft({
    command: '현관 움직임이 감지되면 조건을 확인하고 거실 조명을 켜줘',
    entity_cards: cards,
  }, {
    env: {},
    fetchImpl: async () => ollamaResponse({ status: 'success', automation: invalid }),
  });

  assert.equal(result.status, 'failure');
  assert.match(result.validation.errors.join('\n'), /conditions.*more than 0 items/i);
});

test('Ollama provider rejects Home Assistant shorthand that bypasses Blockly target shape', async () => {
  const shorthand = {
    triggers: [{
      platform: 'state',
      entity_id: 'binary_sensor.entrance_motion',
      to: 'on',
    }],
    conditions: [],
    actions: [{
      service: 'light.turn_on',
      entity_id: 'light.living_room',
    }],
  };

  const result = await createOllamaAutomationDraft({
    command: '현관 움직임이 감지되면 거실 조명을 켜줘',
    entity_cards: cards,
  }, {
    env: {},
    fetchImpl: async () => ollamaResponse({ status: 'success', automation: shorthand }),
  });

  assert.equal(result.status, 'failure');
  assert.match(result.validation.errors.join('\n'), /triggers.*entity_id must be array/i);
  assert.match(result.validation.errors.join('\n'), /required property 'target'/i);
});
