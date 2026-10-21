import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const tickUntil = async (predicate) => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('UI did not reach the expected state');
};

test('real Assistant UI requires an Execute click and shows queried information', async (t) => {
  const html = await readFile(new URL('../../src/index.html', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../../src/homeassistant/llm_assistant/assistant.css', import.meta.url), 'utf8');
  assert.doesNotMatch(styles, /#debugModal|#taskAltModal|#blockSearch|\.blockly/);
  const dom = new JSDOM(html, { url: 'http://localhost/' });
  const originals = { document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch };
  Object.assign(globalThis, { document: dom.window.document, window: dom.window });
  t.after(() => { Object.assign(globalThis, originals); dom.window.close(); });
  let executions = 0;
  let requests = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (url === '/api/llm/providers') return Response.json({ providers: [{ id: 'ollama', label: 'Ollama', configured: true }], default_provider: 'ollama' });
    if (url === '/api/assistant/message') {
      requests++;
      if (requests === 2) return Response.json({ resolution: { status: 'success' }, message: 'Brightness is 128.', result: { kind: 'information', entity: { entity_id: 'light.test', value: 128 } } });
      return Response.json({ resolution: { status: 'needs_confirmation' }, control_preview: { execution_id: 'preview-1', service: 'light.turn_on', risk: 'low', entities: [{ entity_id: 'light.test', display_name: 'Test Light' }] } });
    }
    if (url === '/api/control-now/execute') {
      executions++;
      assert.equal(JSON.parse(options.body).confirmed, true);
      return Response.json({ message: 'Request accepted; state change not confirmed.', result: { kind: 'control', target_count: 1, entity: { entity_id: 'light.test' }, verification: { status: 'not_confirmed' } } });
    }
    throw new Error('Unexpected UI request: ' + url);
  };
  // Load the actual module in Node; CSS is covered by the webpack build.
  let source = await readFile(new URL('../../src/homeassistant/llm_assistant/assistant_ui.js', import.meta.url), 'utf8');
  source = source.replace("import './assistant.css';", '').replace("'../../utils/floating_modal_state.js'", JSON.stringify(new URL('../../src/utils/floating_modal_state.js', import.meta.url).href));
  const { initAiAssistantUI } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  initAiAssistantUI({ ws: { getAllBlocks: () => [] }, renderAutomationToWorkspace() { assert.fail('Control must not import an automation'); } });
  document.getElementById('btnAiAssistant').click();
  await tickUntil(() => document.getElementById('aiAssistantProvider').value === 'ollama');
  const submit = (command) => {
    document.getElementById('aiAssistantInput').value = command;
    document.getElementById('aiAssistantForm').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  };
  submit('Turn on Test Light');
  await tickUntil(() => [...document.querySelectorAll('#aiAssistantMessages button')].some((button) => button.textContent === 'Execute'));
  assert.equal(executions, 0);
  assert.match(document.getElementById('aiAssistantMessages').textContent, /light.turn_on.*low/s);
  [...document.querySelectorAll('#aiAssistantMessages button')].find((button) => button.textContent === 'Execute').click();
  await tickUntil(() => executions === 1 && !document.getElementById('aiAssistantSend').disabled);
  assert.match(document.getElementById('aiAssistantStatus').textContent, /not confirmed/);
  submit('What is Test brightness?');
  await tickUntil(() => document.getElementById('aiAssistantMessages').textContent.includes('Brightness is 128.'));
  assert.equal(executions, 1);
});
