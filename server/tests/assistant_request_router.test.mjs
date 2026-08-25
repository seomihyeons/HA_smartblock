import assert from 'node:assert/strict';
import test from 'node:test';
import { createAssistantRequestRouter } from '../assistant_request_router.mjs';

test('routes from grounded goal-analysis output rather than language regexes', async () => {
  const calls = [];
  const router = createAssistantRequestRouter({
    createDraft: async (payload) => {
      calls.push(['draft', payload]);
      return payload.command === '커피 머신 켜줘'
        ? { status: 'control_intent', service: 'switch.turn_on', candidate_entity_ids: ['switch.coffee'] }
        : { status: 'success', automation: {} };
    },
    previewControl: async (payload) => {
      calls.push(['control', payload]);
      return { status: 'ready_to_execute' };
    },
  });

  const control = await router.handle({ command: '커피 머신 켜줘' });
  assert.equal(control.intent, 'immediate_control');
  assert.equal(control.status, 'ready_to_execute');
  assert.equal(calls[0][1].interaction_mode, 'auto');
  assert.deepEqual(calls[1][1].candidate_entity_ids, ['switch.coffee']);

  const draft = await router.handle({ command: '매일 아침 커피 머신을 켜줘' });
  assert.equal(draft.intent, 'automation');
  assert.equal(draft.status, 'success');
});
