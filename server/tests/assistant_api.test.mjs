import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { createAssistantApp } from '../assistant_api.mjs';
const addonSource = new URL('../../ha_smartblock/server/addon_server.js', import.meta.url);
const { createAddonServer } = await import(existsSync(addonSource) ? addonSource.href : new URL('../addon_server.js', import.meta.url).href);

const automation = {
  alias: 'Motion turns on coffee',
  triggers: [{ trigger: 'state', entity_id: 'binary_sensor.entrance_motion', to: 'on' }],
  conditions: [], actions: [{ action: 'switch.turn_on', target: { entity_id: 'switch.coffee' } }],
};

async function fixture(t, { legacy = false } = {}) {
  let calls = 0;
  let state = 'off';
  const api = createAssistantApp({
    env: { HA_BASE_URL: 'http://mock-ha.invalid/api', HA_TOKEN: 'fixture-only', LLM_ENTITY_RETRIEVAL: 'lexical', LLM_ASSISTANT_BACKEND: legacy ? 'ollama' : 'provider_neutral' },
    fetchImpl: async (url, options = {}) => {
      if (url === 'http://mock-ha.invalid/api/states') return Response.json([
        { entity_id: 'binary_sensor.entrance_motion', state: 'off', attributes: { friendly_name: 'Motion', device_class: 'motion' } },
        { entity_id: 'switch.coffee', state, attributes: { friendly_name: 'Coffee' } },
        { entity_id: 'light.test', state: 'on', attributes: { friendly_name: 'Test', brightness: 128 } },
        { entity_id: 'lock.front', state: 'locked', attributes: { friendly_name: 'Front lock' } },
      ]);
      if (url === 'http://mock-ha.invalid/api/services') return Response.json([
        { domain: 'switch', services: { turn_on: { fields: {} } } },
        { domain: 'light', services: { turn_on: { fields: {} } } },
        { domain: 'lock', services: { unlock: { fields: {} } } },
      ]);
      if (url === 'http://mock-ha.invalid/api/services/switch/turn_on' && options.method === 'POST') {
        calls++; state = 'on'; return Response.json([]);
      }
      throw new Error('Unexpected network boundary: ' + url);
    },
    draftGenerator: async () => ({ status: 'success', automation, validation: { errors: [] } }),
    providerAssistant: {
      getProviders: async () => ({ providers: [{ id: 'ollama', label: 'Ollama', configured: true }], default_provider: 'ollama' }),
      retrieveFastembed: async () => { throw new Error('Embedding unavailable in fixture'); },
      createResponse: async ({ toolResult }) => ({ response: toolResult.intent === 'information' ? `Observed brightness: ${toolResult.result.entity.value}` : `Request ${toolResult.outcome}; state ${toolResult.state_verification || 'not observed'}` }),
      createDraft: async ({ command }) => {
        if (command.startsWith('When')) return { intent: 'automation', plan: { operation: 'automation_generation' }, automation, validation: { valid: true } };
        if (command.includes('brightness')) return { intent: 'information', plan: { operation: 'entity_property', target: { selector: 'entity', entity_id: 'light.test' }, property: 'brightness' }, validation: { valid: true } };
        const service = command.includes('unlock') ? 'lock.unlock' : 'switch.turn_on';
        return { intent: 'control', plan: { operation: 'service_control', target: { selector: 'entity', entity_id: command.includes('unlock') ? 'lock.front' : 'switch.coffee' }, effect: { service, data: {} } }, validation: { valid: true } };
      },
    },
  });
  const server = api.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body, origin = base) => {
    const response = await fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  return { base, post, calls: () => calls };
}

test('HTTP planning never executes; only confirmed Execute calls HA once', async (t) => {
  const f = await fixture(t);
  const preview = await f.post('/api/assistant/message', { command: 'Turn on Coffee', provider: 'ollama', confirmed: true });
  assert.equal(preview.body.resolution.status, 'needs_confirmation');
  assert.equal(f.calls(), 0);
  const execution_id = preview.body.control_preview.execution_id;
  assert.equal((await f.post('/api/control-now/execute', { execution_id })).status, 409);
  assert.equal(f.calls(), 0);
  const executed = await f.post('/api/control-now/execute', { execution_id, confirmed: true, command: 'Turn on Coffee' });
  assert.equal(executed.body.result.request_status, 'accepted');
  assert.equal(executed.body.result.verification.status, 'confirmed');
  assert.match(executed.body.message, /confirmed/);
  assert.equal(f.calls(), 1);
  assert.equal((await f.post('/api/control-now/execute', { execution_id, confirmed: true })).status, 409);
  assert.equal(f.calls(), 1);
});

test('HTTP creation uses actual Blockly round-trip and information is read-only', async (t) => {
  const f = await fixture(t);
  const draft = await f.post('/api/assistant/message', { command: 'When Motion turns on, turn on Coffee', provider: 'ollama' });
  assert.equal(draft.body.resolution?.status, 'success', JSON.stringify(draft.body));
  assert.equal(draft.body.result.validation.roundtrip_verified, true);
  assert.equal(draft.body.result.kind, 'automation');
  const info = await f.post('/api/assistant/message', { command: 'What is Test brightness?', provider: 'ollama' });
  assert.equal(info.body.result.kind, 'information');
  assert.equal(info.body.result.entity.value, 128);
  assert.match(info.body.message, /128/);
  assert.equal(f.calls(), 0);
});

test('HTTP legacy Ollama drafts use the same validated response contract', async (t) => {
  const f = await fixture(t, { legacy: true });
  const response = await f.post('/api/assistant/message', { command: 'When Motion turns on, turn on Coffee' });
  assert.equal(response.body.result?.kind, 'automation', JSON.stringify(response.body));
  assert.equal(response.body.result.validation.roundtrip_verified, true);
  assert.equal(f.calls(), 0);
});

test('add-on forwards Assistant APIs and the high-risk control policy remains enforced', async (t) => {
  const f = await fixture(t);
  const addon = createAddonServer({ assistantUrl: f.base });
  addon.listen(0, '127.0.0.1'); await once(addon, 'listening');
  t.after(() => new Promise((resolve) => addon.close(resolve)));
  const origin = `http://127.0.0.1:${addon.address().port}`;
  const providers = await (await fetch(origin + '/api/llm/providers')).json();
  assert.equal(providers.default_provider, 'ollama');
  const result = await f.post('/api/assistant/message', { command: 'unlock Front lock' }, origin);
  assert.equal(result.body.resolution.status, 'failed');
  assert.equal(result.body.resolution.failure_reason, 'unsupported_capability');
  assert.equal(f.calls(), 0);
});
