import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ProviderNeutralAssistantError,
  createProviderNeutralAssistantAdapter,
} from '../provider_neutral_assistant_adapter.mjs';

test('provider-neutral adapter forwards only public context and maps a valid draft for the UI', async () => {
  let request;
  const adapter = createProviderNeutralAssistantAdapter({
    baseUrl: 'http://127.0.0.1:8792',
    fetchImpl: async (_url, init) => {
      request = JSON.parse(init.body);
      return new Response(JSON.stringify({
        status: 'success',
        automation: { triggers: [], conditions: [], actions: [] },
        validation: { valid: true, errors: [], schema_version: 1 },
        metrics: { provider: 'chatgpt', model: 'gpt-4o', attempts: 1, total_latency_ms: 42 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  const result = await adapter.createDraft({
    command: 'Turn on the hallway switch',
    entityCards: [{ entity_id: 'switch.hallway', supported_actions: ['switch.turn_on'] }],
    capabilityContext: { services: [{ id: 'switch.turn_on', risk: 'low' }] },
  });

  assert.equal(request.command, 'Turn on the hallway switch');
  assert.equal(request.home_context.entity_cards[0].entity_id, 'switch.hallway');
  assert.equal(result.provider, 'chatgpt');
  assert.equal(result.validation.schema_valid, true);
  assert.equal(result.pipeline.mode, 'provider_neutral');
});

test('provider-neutral adapter forwards retrieval evidence without exposing credentials', async () => {
  let request;
  const adapter = createProviderNeutralAssistantAdapter({
    fetchImpl: async (_url, init) => {
      request = JSON.parse(init.body);
      return new Response(JSON.stringify({
        status: 'needs_clarification', validation: { valid: true, errors: [] }, metrics: {},
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  await adapter.createDraft({
    command: 'Turn on the room light',
    entityCards: [{ entity_id: 'light.room', domain: 'light' }],
    retrieval: {
      method: 'hybrid_rrf', embedding_model: 'local-model', candidate_entity_ids: ['light.room'],
      ranking: [{ entity_id: 'light.room', rank: 1, fused_score: 999 }], api_key: 'must-not-forward',
    },
  });

  assert.deepEqual(request.home_context.retrieval, {
    method: 'hybrid_rrf', fallback: false, embedding_model: 'local-model',
    candidate_entity_ids: ['light.room'], ranking: [{ entity_id: 'light.room', rank: 1 }],
  });
});

test('provider-neutral adapter maps a grounded control plan to the existing control router contract', async () => {
  const adapter = createProviderNeutralAssistantAdapter({
    fetchImpl: async () => new Response(JSON.stringify({
      intent: 'control', status: 'success', service: 'light.turn_on', entity_id: 'light.living_room',
      validation: { valid: true, errors: [] },
      metrics: { provider: 'chatgpt', model: 'test', attempts: 1, total_latency_ms: 10 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });
  const result = await adapter.createDraft({ command: 'Turn on the living room light' });
  assert.equal(result.status, 'control_intent');
  assert.equal(result.intent, 'control');
  assert.equal(result.service, 'light.turn_on');
  assert.deepEqual(result.candidate_entity_ids, ['light.living_room']);
});

test('provider-neutral adapter returns a safe error when the local service is unavailable', async () => {
  const adapter = createProviderNeutralAssistantAdapter({
    fetchImpl: async () => { throw new Error('connection details must not reach UI'); },
  });

  await assert.rejects(
    () => adapter.createDraft({ command: 'test' }),
    (error) => error instanceof ProviderNeutralAssistantError
      && error.message === 'The provider-neutral LLM assistant is unavailable.',
  );
});

test('provider-neutral adapter exposes configuration state without credentials', async () => {
  const adapter = createProviderNeutralAssistantAdapter({
    fetchImpl: async (url) => {
      assert.equal(url, 'http://127.0.0.1:8792/v1/providers');
      return new Response(JSON.stringify({
        providers: [
          { id: 'chatgpt', label: 'ChatGPT', configured: true, api_key: 'must-not-forward' },
          { id: 'claude', label: 'Claude', configured: false },
          { id: 'untrusted', label: 'Untrusted', configured: true },
        ],
        default_provider: 'chatgpt',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  assert.deepEqual(await adapter.getProviders(), {
    providers: [
      { id: 'chatgpt', label: 'ChatGPT', configured: true },
      { id: 'claude', label: 'Claude', configured: false },
    ],
    default_provider: 'chatgpt',
  });
});
