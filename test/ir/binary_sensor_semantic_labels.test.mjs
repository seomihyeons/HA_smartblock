import assert from 'node:assert/strict';
import test from 'node:test';
import * as Blockly from 'blockly';

import '../../src/blocks/extensions.js';
import { eventEntityBlocks } from '../../src/blocks/event/event_entity.js';
import { conditionStateBlocks } from '../../src/blocks/condition/condition_entity_state.js';
import { setFixtureEntities } from './entity_fixture.mjs';
import { getBinarySensorStateOptions, getStates } from '../../src/data/options.js';
import { yamlGenerator } from '../../src/generators/yaml.js';

Blockly.common.defineBlocks(eventEntityBlocks);
Blockly.common.defineBlocks(conditionStateBlocks);

const DOOR_ID = 'binary_sensor.front_door';
const MOTION_ID = 'binary_sensor.entrance_motion';
const GENERIC_ID = 'binary_sensor.night_mode';
const LIGHT_ID = 'light.entrance';

function optionPairs(field) {
  return field.getOptions(false).map(([label, value]) => [String(label), String(value)]);
}

async function flushEntitySelection() {
  await Promise.resolve();
}

test('door and motion binary sensors show semantic labels while preserving Home Assistant on/off values', async () => {
  setFixtureEntities([
    {
      entity_id: DOOR_ID,
      state: 'off',
      attributes: { friendly_name: 'Front Door', device_class: 'door' },
    },
    {
      entity_id: MOTION_ID,
      state: 'off',
      attributes: { friendly_name: 'Entrance Motion', device_class: 'motion' },
    },
    {
      entity_id: GENERIC_ID,
      state: 'off',
      attributes: { friendly_name: 'Night Mode' },
    },
    {
      entity_id: LIGHT_ID,
      state: 'off',
      attributes: { friendly_name: 'Entrance Light' },
    },
  ]);

  assert.deepEqual(getStates('binary_sensor'), [['on', 'on'], ['off', 'off']]);
  assert.deepEqual(
    getBinarySensorStateOptions(DOOR_ID, { includeAny: true }),
    [['opened', 'on'], ['closed', 'off'], ['(any)', '']]
  );
  assert.deepEqual(
    getBinarySensorStateOptions(MOTION_ID, { includeAny: true }),
    [['detected', 'on'], ['cleared', 'off'], ['(any)', '']]
  );

  const workspace = new Blockly.Workspace();
  const trigger = workspace.newBlock('event_binary_sensor_state');
  assert.equal(trigger.getFieldValue('FROM'), '', 'new state triggers default FROM to (any)');
  assert.equal(trigger.getFieldValue('TO'), 'on', 'new state triggers default TO to on');
  trigger.setFieldValue(DOOR_ID, 'ENTITY_ID');
  await flushEntitySelection();

  assert.deepEqual(
    optionPairs(trigger.getField('FROM')),
    [['(any)', ''], ['opened', 'on'], ['closed', 'off']]
  );
  assert.deepEqual(
    optionPairs(trigger.getField('TO')),
    [['opened', 'on'], ['closed', 'off'], ['(any)', '']]
  );

  trigger.setFieldValue('on', 'TO');
  assert.match(yamlGenerator.blockToCode(trigger), /to: 'on'/);

  const condition = workspace.newBlock('condition_state_binary_sensor');
  condition.setFieldValue(DOOR_ID, 'ENTITY_ID');
  await flushEntitySelection();

  assert.deepEqual(
    optionPairs(condition.getField('STATE')),
    [['opened', 'on'], ['closed', 'off']]
  );
  condition.setFieldValue('off', 'STATE');
  assert.match(yamlGenerator.blockToCode(condition), /state: 'off'/);

  trigger.setFieldValue(MOTION_ID, 'ENTITY_ID');
  condition.setFieldValue(MOTION_ID, 'ENTITY_ID');
  await flushEntitySelection();

  assert.deepEqual(
    optionPairs(trigger.getField('FROM')),
    [['(any)', ''], ['detected', 'on'], ['cleared', 'off']]
  );
  assert.deepEqual(
    optionPairs(trigger.getField('TO')),
    [['detected', 'on'], ['cleared', 'off'], ['(any)', '']]
  );
  assert.deepEqual(
    optionPairs(condition.getField('STATE')),
    [['detected', 'on'], ['cleared', 'off']]
  );
  trigger.setFieldValue('on', 'TO');
  condition.setFieldValue('off', 'STATE');
  assert.match(yamlGenerator.blockToCode(trigger), /to: 'on'/);
  assert.match(yamlGenerator.blockToCode(condition), /state: 'off'/);

  trigger.setFieldValue(GENERIC_ID, 'ENTITY_ID');
  condition.setFieldValue(GENERIC_ID, 'ENTITY_ID');
  await flushEntitySelection();

  assert.deepEqual(
    optionPairs(trigger.getField('FROM')),
    [['(any)', ''], ['on', 'on'], ['off', 'off']]
  );
  assert.deepEqual(
    optionPairs(trigger.getField('TO')),
    [['on', 'on'], ['off', 'off'], ['(any)', '']]
  );
  assert.deepEqual(
    optionPairs(condition.getField('STATE')),
    [['on', 'on'], ['off', 'off']]
  );

  const lightTrigger = workspace.newBlock('event_light_state');
  assert.equal(lightTrigger.getFieldValue('FROM'), '');
  assert.equal(lightTrigger.getFieldValue('TO'), 'on');
  lightTrigger.setFieldValue(LIGHT_ID, 'ENTITY_ID');
  assert.match(yamlGenerator.blockToCode(lightTrigger), /to: 'on'/);
  assert.doesNotMatch(yamlGenerator.blockToCode(lightTrigger), /from:/);

  workspace.dispose();
});
