import assert from 'node:assert/strict';
import test from 'node:test';
import * as Blockly from 'blockly';

import '../../src/blocks/condition/condition_numeric_state_entity.js';
import { setStudyRuntimeEntities } from '../../src/data/entities_index.js';

test('numeric state condition remains constructible when runtime HA has no numeric state', () => {
  setStudyRuntimeEntities([
    {
      entity_id: 'binary_sensor.entrance_door',
      state: 'off',
      attributes: { friendly_name: 'Entrance Door', device_class: 'door' },
    },
    {
      entity_id: 'sensor.living_room_humidity',
      state: 'unavailable',
      attributes: { friendly_name: 'Living Room Humidity' },
    },
  ]);

  const workspace = new Blockly.Workspace();
  const block = workspace.newBlock('condition_numeric_state_entity');
  assert.deepEqual(
    block.getField('ENTITY_ID').getOptions(false),
    [['(No numeric entities)', '']]
  );
  workspace.dispose();
});

test('numeric state condition lists numeric runtime entities when available', () => {
  setStudyRuntimeEntities([
    {
      entity_id: 'sensor.living_room_humidity',
      state: '72.5',
      attributes: { friendly_name: 'Living Room Humidity' },
    },
  ]);

  const workspace = new Blockly.Workspace();
  const block = workspace.newBlock('condition_numeric_state_entity');
  assert.deepEqual(
    block.getField('ENTITY_ID').getOptions(false),
    [['Living Room Humidity', 'sensor.living_room_humidity']]
  );
  workspace.dispose();
});
