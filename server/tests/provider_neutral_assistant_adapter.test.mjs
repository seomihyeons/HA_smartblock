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
        intent: 'automation', plan: { yaml: 'triggers: []\nconditions: []\nactions: []\n' },
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
  assert.equal(result.validation.schema_valid, false);
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

test('provider-neutral adapter requests a factual final response from the selected provider', async () => {
  let request;
  const adapter = createProviderNeutralAssistantAdapter({
    fetchImpl: async (url, init) => {
      assert.equal(url, 'http://127.0.0.1:8792/v1/assistant/respond');
      request = JSON.parse(init.body);
      return new Response(JSON.stringify({
        response: 'The living room light is on.',
        metrics: { provider: 'chatgpt', model: 'test', latency_ms: 12 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  const result = await adapter.createResponse({
    command: 'Is the living room light on?',
    provider: 'chatgpt',
    responseLanguage: 'en',
    toolResult: { outcome: 'success', intent: 'information', state: 'on' },
  });
  assert.equal(request.provider, 'chatgpt');
  assert.equal(request.response_language, 'en');
  assert.deepEqual(request.tool_result, { outcome: 'success', intent: 'information', state: 'on' });
  assert.equal(result.response, 'The living room light is on.');
});

test('provider-neutral adapter maps a grounded control plan to the existing control router contract', async () => {
  const adapter = createProviderNeutralAssistantAdapter({
    fetchImpl: async () => new Response(JSON.stringify({
      intent: 'control', plan: { service: 'light.turn_on', entity_id: 'light.living_room', data: {} },
      validation: { valid: true, errors: [] },
      metrics: { provider: 'chatgpt', model: 'test', attempts: 1, total_latency_ms: 10 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });
  const result = await adapter.createDraft({ command: 'Turn on the living room light' });
  assert.equal(result.intent, 'control');
  assert.equal(result.plan.service, 'light.turn_on');
  assert.equal(result.plan.entity_id, 'light.living_room');
});

test('provider-neutral adapter maps a grounded information plan to the read-only router contract', async () => {
  const adapter = createProviderNeutralAssistantAdapter({
    fetchImpl: async () => new Response(JSON.stringify({
      intent: 'information', plan: { entity_id: 'light.living_room' },
      validation: { valid: true, errors: [] },
      metrics: { provider: 'chatgpt', model: 'test', attempts: 1, total_latency_ms: 10 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });
  const result = await adapter.createDraft({ command: 'Is the living room light on?' });
  assert.equal(result.intent, 'information');
  assert.equal(result.plan.entity_id, 'light.living_room');
  assert.equal(result.validation.grounded, false);
});

test('provider-neutral adapter maps a validated aggregate information query without an entity ID', async () => {
  const adapter = createProviderNeutralAssistantAdapter({
    fetchImpl: async () => new Response(JSON.stringify({
      intent: 'information', plan: { information_query: { kind: 'aggregate', aggregation: 'count', domain: 'fan' } },
      validation: { valid: true, errors: [] },
      metrics: { provider: 'chatgpt', model: 'test', attempts: 1, total_latency_ms: 10 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });
  const result = await adapter.createDraft({
    command: 'How many fans are there?',
    informationInventory: [{ domain: 'fan', count: 4 }],
  });
  assert.deepEqual(result.plan.information_query, { kind: 'aggregate', aggregation: 'count', domain: 'fan' });
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

test('provider-neutral adapter forwards Entity Cards to the local FastEmbed endpoint only', async () => {
  let request;
  const adapter = createProviderNeutralAssistantAdapter({
    fetchImpl: async (url, init) => {
      assert.equal(url, 'http://127.0.0.1:8792/v1/retrieval/fastembed');
      request = JSON.parse(init.body);
      return new Response(JSON.stringify({
        embedding_model: 'intfloat/multilingual-e5-small',
        ranking: [{ entity_id: 'light.living_room', rank: 1, score: 0.8 }],
        cache: { cache_hits: 1, embedded_cards: 0 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  const result = await adapter.retrieveFastembed({
    query: '거실 조명을 켜줘',
    entityCards: [{ entity_id: 'light.living_room', friendly_name: 'Living Room Light' }],
  });
  assert.equal(request.query, '거실 조명을 켜줘');
  assert.equal(request.entity_cards[0].entity_id, 'light.living_room');
  assert.equal(result.ranking[0].entity_id, 'light.living_room');
});
