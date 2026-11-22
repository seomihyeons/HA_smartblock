import test from 'node:test';
import assert from 'node:assert/strict';
import * as Blockly from 'blockly';

import { setStudyRuntimeEntities } from '../src/data/entities_index.js';
import {
  getBinarySensorStateBlockType,
  getBinarySensorStateOptions,
} from '../src/data/options.js';
import {
  scoreEntitySearch,
  selectSearchEntity,
} from '../src/block_search_entity_matcher.js';
import { createToolbox } from '../src/toolbox.js';
import { isToolboxBlockAvailable } from '../src/toolbox_availability.js';
import { eventEntityBlocks } from '../src/blocks/event/event_entity.js';
import { conditionStateBlocks } from '../src/blocks/condition/condition_entity_state.js';
import '../src/blocks/extensions.js';
import { yamlGenerator } from '../src/generators/yaml.js';
import { createTriggerBlock } from '../src/import/blocks/trigger_mapper.js';
import { createConditionsRoot } from '../src/import/blocks/condition_mapper.js';
import { getBlockSearchResults } from '../src/block_search_flyout.js';

Blockly.common.defineBlocks(eventEntityBlocks);
Blockly.common.defineBlocks(conditionStateBlocks);

const ENTITIES = [
  {
    entity_id: 'binary_sensor.living_motion',
    state: 'off',
    attributes: { friendly_name: 'Living Room Motion', device_class: 'motion' },
  },
  {
    entity_id: 'binary_sensor.entrance_door',
    state: 'off',
    attributes: { friendly_name: 'Entrance Door', device_class: 'door' },
  },
  {
    entity_id: 'binary_sensor.utility_leak',
    state: 'off',
    attributes: { friendly_name: 'Utility Leak', device_class: 'moisture' },
  },
];

setStudyRuntimeEntities(ENTITIES);

function findBlockTypes(categoryName) {
  const category = createToolbox(ENTITIES).contents.find((item) => item.name === categoryName);
  return category.contents.filter((item) => item.kind === 'block').map((item) => item.type);
}

test('compact Entity searches preserve token search behavior', () => {
  const motion = ENTITIES[0];
  const door = ENTITIES[1];

  for (const query of [
    'Living Room Motion',
    'living room motion',
    'livingroommotion',
    'LivingRoomMotion',
    'living_room_motion',
    'living-room-motion',
    'livingroommot',
  ]) {
    assert.ok(scoreEntitySearch(query, motion) >= 0, query);
  }
  for (const query of ['Entrance Door', 'entrancedoor', 'entrance_door', 'EntranceDoor']) {
    assert.ok(scoreEntitySearch(query, door) >= 0, query);
  }
});

test('search seeds the matching Entity in the dedicated Motion and Door blocks', () => {
  const motion = selectSearchEntity('event_binary_sensor_motion_state', 'livingroommotion', ENTITIES);
  const door = selectSearchEntity('condition_state_binary_sensor_door', 'entrancedoor', ENTITIES);

  assert.deepEqual(motion && { field: motion.field, entityId: motion.entityId }, {
    field: 'ENTITY_ID', entityId: 'binary_sensor.living_motion',
  });
  assert.deepEqual(door && { field: door.field, entityId: door.entityId }, {
    field: 'ENTITY_ID', entityId: 'binary_sensor.entrance_door',
  });
  assert.equal(selectSearchEntity('event_binary_sensor_motion_state', 'entrancedoor', ENTITIES), null);
});

test('Motion and Door select dedicated types while unknown classes retain the generic block', () => {
  assert.equal(getBinarySensorStateBlockType('binary_sensor.living_motion', 'event'), 'event_binary_sensor_motion_state');
  assert.equal(getBinarySensorStateBlockType('binary_sensor.entrance_door', 'condition'), 'condition_state_binary_sensor_door');
  assert.equal(getBinarySensorStateBlockType('binary_sensor.utility_leak', 'event'), 'event_binary_sensor_state');

  assert.deepEqual(getBinarySensorStateOptions('binary_sensor.living_motion'), [
    ['detected', 'on'], ['cleared', 'off'],
  ]);
  assert.deepEqual(getBinarySensorStateOptions('binary_sensor.entrance_door'), [
    ['opened', 'on'], ['closed', 'off'],
  ]);
});

test('toolbox exposes dedicated blocks without exposing the generic Binary Sensor blocks', () => {
  const triggers = findBlockTypes('Trigger');
  const conditions = findBlockTypes('Condition');
  assert.ok(triggers.includes('event_binary_sensor_motion_state'));
  assert.ok(triggers.includes('event_binary_sensor_door_state'));
  assert.ok(conditions.includes('condition_state_binary_sensor_motion'));
  assert.ok(conditions.includes('condition_state_binary_sensor_door'));
  assert.equal(triggers.includes('event_binary_sensor_state'), false);
  assert.equal(conditions.includes('condition_state_binary_sensor'), false);
  assert.equal(isToolboxBlockAvailable('event_binary_sensor_motion_state', ENTITIES), true);
  assert.equal(isToolboxBlockAvailable('event_binary_sensor_door_state', ENTITIES), true);
  assert.equal(isToolboxBlockAvailable('event_binary_sensor_motion_state', [ENTITIES[1]]), false);
});

test('dedicated block dropdowns filter Entities and emit canonical on/off YAML', () => {
  const workspace = new Blockly.Workspace();
  const motion = workspace.newBlock('event_binary_sensor_motion_state');
  const door = workspace.newBlock('condition_state_binary_sensor_door');

  assert.equal(motion.inputList[0].fieldRow[0].getText(), 'motion');
  assert.deepEqual(motion.getField('ENTITY_ID').getOptions(false), [
    ['Living Room Motion', 'binary_sensor.living_motion'],
  ]);
  assert.deepEqual(door.getField('ENTITY_ID').getOptions(false), [
    ['Entrance Door', 'binary_sensor.entrance_door'],
  ]);

  motion.setFieldValue('binary_sensor.living_motion', 'ENTITY_ID');
  motion.setFieldValue('on', 'TO');
  door.setFieldValue('binary_sensor.entrance_door', 'ENTITY_ID');
  door.setFieldValue('off', 'STATE');

  assert.deepEqual(motion.getField('TO').getOptions(false), [
    ['detected', 'on'], ['cleared', 'off'], ['(any)', ''],
  ]);
  assert.deepEqual(door.getField('STATE').getOptions(false), [
    ['opened', 'on'], ['closed', 'off'],
  ]);
  assert.match(yamlGenerator.blockToCode(motion), /to: 'on'/);
  assert.match(yamlGenerator.blockToCode(door), /state: 'off'/);
  workspace.dispose();
});

test('YAML import chooses a dedicated type when the runtime Entity class is known', () => {
  const workspace = new Blockly.Workspace();
  const motion = createTriggerBlock({
    trigger: 'state', entity_id: 'binary_sensor.living_motion', to: 'on',
  }, workspace);
  const door = createConditionsRoot([{
    condition: 'state', entity_id: 'binary_sensor.entrance_door', state: 'off',
  }], workspace);
  const generic = createTriggerBlock({
    trigger: 'state', entity_id: 'binary_sensor.utility_leak', to: 'on',
  }, workspace);
  const unknown = createConditionsRoot([{
    condition: 'state', entity_id: 'binary_sensor.unavailable_class', state: 'on',
  }], workspace);

  assert.equal(motion.type, 'event_binary_sensor_motion_state');
  assert.equal(door.type, 'condition_state_binary_sensor_door');
  assert.equal(generic.type, 'event_binary_sensor_state');
  assert.equal(unknown.type, 'condition_state_binary_sensor');
  workspace.dispose();
});

test('existing generic Binary Sensor workspaces restore unchanged', () => {
  const source = new Blockly.Workspace();
  const oldBlock = source.newBlock('event_binary_sensor_state');
  oldBlock.setFieldValue('binary_sensor.living_motion', 'ENTITY_ID');
  oldBlock.setFieldValue('on', 'TO');
  const saved = Blockly.serialization.workspaces.save(source);

  const restored = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(saved, restored);
  const block = restored.getAllBlocks()[0];
  assert.equal(block.type, 'event_binary_sensor_state');
  assert.equal(block.getFieldValue('ENTITY_ID'), 'binary_sensor.living_motion');
  assert.equal(block.getFieldValue('TO'), 'on');
  source.dispose();
  restored.dispose();
});

test('Block Search returns the matching Entity and prioritizes its dedicated block', () => {
  const searchBinaryResults = (query, category, prefix) => getBlockSearchResults(query)
    .filter((result) => result.category === category && result.type.startsWith(prefix));

  for (const query of [
    'Living Room Motion', 'living room motion', 'livingroommotion', 'LivingRoomMotion',
    'living_room_motion', 'living-room-motion', 'livingroommot',
  ]) {
    const results = searchBinaryResults(query, 'Trigger', 'event_binary_sensor');
    assert.equal(results[0].type, 'event_binary_sensor_motion_state', query);
    assert.equal(results[0].entitySelection.entityId, 'binary_sensor.living_motion', query);
    assert.equal(results.some((result) => result.type === 'event_binary_sensor_state'), false, query);
  }
  for (const query of ['Entrance Door', 'entrancedoor', 'entrance_door', 'EntranceDoor']) {
    const results = searchBinaryResults(query, 'Condition', 'condition_state_binary_sensor');
    assert.equal(results[0].type, 'condition_state_binary_sensor_door', query);
    assert.equal(results[0].entitySelection.entityId, 'binary_sensor.entrance_door', query);
    assert.equal(results.some((result) => result.type === 'condition_state_binary_sensor'), false, query);
  }
});

test('Numeric State trigger stays under Trigger State rather than Group', () => {
  const trigger = createToolbox(ENTITIES).contents.find((category) => category.name === 'Trigger');
  const placements = [];
  let section = '';

  for (const item of trigger.contents) {
    if (item.kind === 'label') section = item.text;
    if (item.kind === 'block' && item.type === 'event_sensor_numeric_state') {
      placements.push(section);
    }
  }

  assert.deepEqual(placements, ['State']);
  const searchResult = getBlockSearchResults('numeric state')
    .find((result) => result.category === 'Trigger' && result.type === 'event_sensor_numeric_state');
  assert.equal(searchResult?.section, 'State');
});
