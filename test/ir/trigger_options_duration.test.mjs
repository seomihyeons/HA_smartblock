import assert from 'node:assert/strict';
import test from 'node:test';
import * as Blockly from 'blockly';

import '../../src/blocks/extensions.js';
import { eventEntityBlocks } from '../../src/blocks/event/event_entity.js';
import { eventForBlocks } from '../../src/blocks/event/event_for.js';
import { setStudyRuntimeEntities } from '../../src/data/entities_index.js';
import { yamlTextToInternalJson } from '../../src/import/yaml_import.js';
import { createTriggerBlock } from '../../src/import/blocks/trigger_mapper.js';

Blockly.common.defineBlocks(eventEntityBlocks);
Blockly.common.defineBlocks(eventForBlocks);

setStudyRuntimeEntities([
  {
    entity_id: 'binary_sensor.front_door',
    state: 'off',
    attributes: { friendly_name: 'Entrance Door', device_class: 'door' },
  },
  {
    entity_id: 'binary_sensor.entrance_motion',
    state: 'off',
    attributes: { friendly_name: 'Entrance Motion', device_class: 'motion' },
  },
]);

function importTrigger(yaml) {
  const automation = yamlTextToInternalJson(yaml);
  const workspace = new Blockly.Workspace();
  const block = createTriggerBlock(automation.triggers[0], workspace);
  return { automation, workspace, block };
}

test('imports non-zero options.for as the existing for duration block', () => {
  const { automation, workspace, block } = importTrigger(`
triggers:
  - trigger: state
    entity_id: binary_sensor.front_door
    options:
      for: "00:00:05"
`);

  assert.deepEqual(automation.triggers[0].for, { hours: 0, minutes: 0, seconds: 5 });
  const duration = block.getInputTargetBlock('FOR');
  assert.equal(duration?.type, 'ha_event_for_hms');
  assert.equal(duration.getFieldValue('S'), '5');
  workspace.dispose();
});

test('does not create a duration block for options.for: 00:00:00', () => {
  const { automation, workspace, block } = importTrigger(`
triggers:
  - trigger: state
    entity_id: binary_sensor.front_door
    options:
      for: "00:00:00"
`);

  assert.equal(automation.triggers[0].for, undefined);
  assert.equal(block.getInputTargetBlock('FOR'), null);
  workspace.dispose();
});

test('normalizes supported Home Assistant device triggers and keeps their non-zero duration', () => {
  const { automation, workspace, block } = importTrigger(`
triggers:
  - trigger: door.opened
    target:
      entity_id: binary_sensor.front_door
    options:
      behavior: each
      for: "00:01:00"
`);

  assert.deepEqual(automation.triggers[0], {
    trigger: 'state',
    entity_id: ['binary_sensor.front_door'],
    to: 'on',
    for: { hours: 0, minutes: 1, seconds: 0 },
  });
  assert.equal(block.type, 'event_binary_sensor_state');
  assert.equal(block.getFieldValue('TO'), 'on');
  assert.equal(block.getInputTargetBlock('FOR')?.getFieldValue('M'), '1');
  workspace.dispose();
});
