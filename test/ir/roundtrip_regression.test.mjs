import assert from 'node:assert/strict';
import test from 'node:test';
import * as Blockly from 'blockly';
import { createHeadlessWorkspace } from '../helpers/headless_workspace.mjs';
import { runTaskAltBatch, buildBaselineFromResults, mergeBaselineStore, compareResultsWithBaseline } from '../task_alt/run_task_alt.js';

const files = [
  {
    name: 'static-door-light.yaml',
    text: async () => `alias: Static door light
triggers:
  - trigger: state
    entity_id: binary_sensor.sb_test_door
    to: 'on'
actions:
  - action: light.turn_on
    target:
      entity_id: light.sb_test_light
`,
  },
  {
    name: 'raw-trigger.yaml',
    text: async () => `alias: Custom trigger
triggers:
  - trigger: custom_integration_event
    custom_option: preserved
actions:
  - delay: '00:01:00'
`,
  },
  {
    name: 'legacy-notification.yaml',
    text: async () => `alias: Legacy notification
triggers:
  - trigger: state
    entity_id: binary_sensor.sb_test_door
    to: 'on'
actions:
  - action: notify.USER1_devices
    data:
      message: Door opened
`,
  },
];

test('offline YAML round-trip preserves native, raw and legacy notification automations', async () => {
  const workspace = createHeadlessWorkspace();
  try {
    const sentinel = workspace.newBlock('event_action');
    sentinel.setFieldValue('Workspace remains intact', 'ALIAS');
    const before = Blockly.serialization.workspaces.save(workspace);
    const { results } = await runTaskAltBatch(files, workspace);
    assert.equal(results.length, files.length);
    for (const result of results) {
      assert.ok(['PASS', 'PASS_WITH_NORMALIZATION', 'PASS_WITH_RAW'].includes(result.status), result.lines);
    }
    assert.equal(results[1].status, 'PASS_WITH_RAW');
    assert.deepEqual(Blockly.serialization.workspaces.save(workspace), before);
    const baseline = mergeBaselineStore(null, buildBaselineFromResults(results));
    const same = compareResultsWithBaseline(results, baseline);
    assert.equal(same.regressions.length, 0);
    const degraded = results.map((result, index) => index ? result : { ...result, status: 'FAIL' });
    assert.ok(compareResultsWithBaseline(degraded, baseline).regressions.length > 0);
  } finally {
    workspace.dispose();
  }
});
