import assert from 'node:assert/strict';
import test from 'node:test';
import * as Blockly from 'blockly';

import '../../src/blocks/extensions.js';
import { eventEntityBlocks } from '../../src/blocks/event/event_entity.js';
import { conditionStateBlocks } from '../../src/blocks/condition/condition_entity_state.js';
import { actionEntityBlocks } from '../../src/blocks/action/action_entity.js';
import { STUDY_ENTITY_IDS } from '../../src/data/study_entity_filter.js';
import { loadStudyRuntimeEntities } from '../../src/data/entities_index.js';
import { getActions, getStates } from '../../src/data/options.js';
import { setToolboxEntities, toolbox } from '../../src/toolbox.js';

Blockly.common.defineBlocks(eventEntityBlocks);
Blockly.common.defineBlocks(conditionStateBlocks);
Blockly.common.defineBlocks(actionEntityBlocks);

const DOOR_IDS = new Set([
  'binary_sensor.front_door',
  'binary_sensor.back_door',
  'binary_sensor.entrance_door',
  'binary_sensor.bedroom_door',
  'binary_sensor.bathroom_door',
  'binary_sensor.kitchen_door',
]);

const STUDY_TASKS = {
  'binary_sensor.front_door': { event: true, condition: true, action: false },
  'binary_sensor.back_door': { event: true, condition: true, action: false },
  'binary_sensor.entrance_door': { event: true, condition: true, action: false },
  'binary_sensor.bedroom_door': { event: true, condition: true, action: false },
  'binary_sensor.bathroom_door': { event: true, condition: true, action: false },
  'binary_sensor.kitchen_door': { event: true, condition: true, action: false },
  'binary_sensor.entrance_motion': { event: true, condition: true, action: false },
  'binary_sensor.bedroom_motion': { event: true, condition: true, action: false },
  'binary_sensor.living_motion': { event: true, condition: true, action: false },
  'device_tracker.resident': { event: true, condition: true, action: false },
  'binary_sensor.night_mode': { event: true, condition: true, action: false },
  'light.entrance': { event: true, condition: true, action: true },
  'light.hallway': { event: true, condition: true, action: true },
  'light.bedroom': { event: true, condition: true, action: true },
  'light.kitchen': { event: true, condition: true, action: true },
  'light.living_room': { event: true, condition: true, action: true },
  'siren.home_alarm': { event: true, condition: true, action: true },
};

const runtimeEntity = (entity_id) => ({
  entity_id,
  state: entity_id === 'device_tracker.resident' ? 'home' : 'off',
  attributes: {
    friendly_name: entity_id,
    ...(DOOR_IDS.has(entity_id) ? { device_class: 'door' } : {}),
  },
});

function dropdownIds(workspace, blockType) {
  if (!Blockly.Blocks[blockType]) return [];
  const block = workspace.newBlock(blockType);
  const ids = block.getField('ENTITY_ID')?.getOptions?.().map(([, value]) => value) || [];
  block.dispose(false);
  return ids;
}

test('all Study task entities expose their required Event, Condition, and Action selectors', async () => {
  const result = await loadStudyRuntimeEntities(async () => ({
    ok: true,
    json: async () => ({
      entities: [
        ...STUDY_ENTITY_IDS.map(runtimeEntity),
        runtimeEntity('sun.sun'),
        runtimeEntity('weather.home'),
        runtimeEntity('person.someone'),
        runtimeEntity('light.sb_test_light'),
        runtimeEntity('switch.runtime_switch'),
      ],
    }),
  }));

  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(STUDY_TASKS), STUDY_ENTITY_IDS);

  const workspace = new Blockly.Workspace();
  for (const [entityId, requirements] of Object.entries(STUDY_TASKS)) {
    const domain = entityId.split('.', 1)[0];
    const eventIds = dropdownIds(workspace, `event_${domain}_state`);
    const conditionIds = dropdownIds(workspace, `condition_state_${domain}`);
    const actionIds = dropdownIds(workspace, `action_${domain}`);

    assert.equal(eventIds.includes(entityId), requirements.event, `${entityId}: Event selector`);
    assert.equal(conditionIds.includes(entityId), requirements.condition, `${entityId}: Condition selector`);
    assert.equal(actionIds.includes(entityId), requirements.action, `${entityId}: Action selector`);
  }

  const binaryStates = getStates('binary_sensor').map(([, value]) => value);
  assert.deepEqual(binaryStates, ['on', 'off']);
  assert.deepEqual(getStates('device_tracker').map(([, value]) => value), ['home', 'not_home']);
  assert.deepEqual(getStates('siren').map(([, value]) => value), ['on', 'off']);
  assert.deepEqual(getActions('siren').map(([, value]) => value), ['turn_on', 'turn_off']);

  // Generic/domain selectors mirror the connected Home Assistant runtime.
  // Non-study runtime entities remain selectable just as they are in HA Native.
  const lightIds = dropdownIds(workspace, 'action_light');
  const sunEventIds = dropdownIds(workspace, 'event_sun_state');
  const sunConditionIds = dropdownIds(workspace, 'condition_state_sun');
  const weatherConditionIds = dropdownIds(workspace, 'condition_state_weather');
  const personConditionIds = dropdownIds(workspace, 'condition_state_person');
  const lockConditionIds = dropdownIds(workspace, 'condition_state_lock');

  assert.ok(lightIds.includes('light.sb_test_light'));
  assert.ok(sunEventIds.includes('sun.sun'));
  assert.ok(sunConditionIds.includes('sun.sun'));
  assert.ok(weatherConditionIds.includes('weather.home'));
  assert.ok(personConditionIds.includes('person.someone'));
  assert.deepEqual(lockConditionIds, ['']);
});

test('runtime-aware toolbox exposes applicable blocks for every loaded runtime domain', async () => {
  const result = await loadStudyRuntimeEntities(async () => ({
    ok: true,
    json: async () => ({
      entities: [
        ...STUDY_ENTITY_IDS.map(runtimeEntity),
        runtimeEntity('weather.home'),
        runtimeEntity('switch.runtime_switch'),
      ],
    }),
  }));
  setToolboxEntities(result.runtimeEntities);

  const category = (name) => toolbox.contents.find((item) => item.name === name);
  const blockTypes = (name) => category(name).contents
    .filter((item) => item.kind === 'block')
    .map((item) => item.type);

  for (const domain of ['binary_sensor', 'device_tracker', 'light', 'siren', 'weather', 'switch']) {
    assert.ok(blockTypes('Event').includes(`event_${domain}_state`), `${domain}: Event toolbox block`);
    assert.ok(blockTypes('Condition').includes(`condition_state_${domain}`), `${domain}: Condition toolbox block`);
  }
  for (const domain of ['light', 'siren', 'switch']) {
    assert.ok(blockTypes('Action').includes(`action_${domain}`), `${domain}: Action toolbox block`);
  }
});
