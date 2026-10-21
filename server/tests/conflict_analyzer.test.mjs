import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('the preserved Conflict Analyzer detects opposing actions using stdin only', () => {
  const script = fileURLToPath(new URL('../../src/homeassistant/conflict_analyzer/ha_eca_conflict_analyzer.py', import.meta.url));
  const yaml = ['on', 'off'].map((state) => `- alias: Test ${state}
  triggers:
    - trigger: state
      entity_id: binary_sensor.test
      to: 'on'
  actions:
    - action: light.turn_${state}
      target:
        entity_id: light.test
`).join('');
  const result = spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-B', script, '--out', 'stdout'], {
    input: yaml, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, PYTHONUTF8: '1' },
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  const report = JSON.parse(result.stdout);
  assert.equal(report.summary.automations, 2);
  assert.equal(report.summary.inconsistency_issues, 1);
});
