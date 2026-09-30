import test from 'node:test';
import assert from 'node:assert/strict';
import * as Blockly from 'blockly';

import '../../src/blocks/extensions.js';
import { dummyEntities } from '../../src/data/entities_index.js';
import { eventEntityBlocks } from '../../src/blocks/event/event_entity.js';
import { actionEntityBlocks } from '../../src/blocks/action/action_entity.js';

Blockly.common.defineBlocks(eventEntityBlocks);
Blockly.common.defineBlocks(actionEntityBlocks);

test('Synthetic Home RT-BEH-001 entities are available in state-trigger and light-action dropdowns', () => {
  const door = dummyEntities.find((entity) => entity.entity_id === 'binary_sensor.sb_test_door');
  const light = dummyEntities.find((entity) => entity.entity_id === 'light.sb_test_light');

  assert.equal(door.domain, 'binary_sensor');
  assert.equal(door.state, 'off');
  assert.equal(door.attributes.friendly_name, 'SB Test Door');
  assert.equal(door.attributes.device_class, 'door');

  assert.equal(light.domain, 'light');
  assert.equal(light.state, 'off');
  assert.equal(light.attributes.friendly_name, 'SB Test Light');
  assert.deepEqual(light.attributes.supported_color_modes, ['onoff']);

  const workspace = new Blockly.Workspace();
  const trigger = workspace.newBlock('event_binary_sensor_state');
  const action = workspace.newBlock('action_light');

  assert.ok(
    trigger.getField('ENTITY_ID').getOptions()
      .some(([, entityId]) => entityId === 'binary_sensor.sb_test_door'),
  );
  assert.ok(
    action.getField('ENTITY_ID').getOptions()
      .some(([, entityId]) => entityId === 'light.sb_test_light'),
  );
});
