import assert from 'node:assert/strict';
import test from 'node:test';
import * as Blockly from 'blockly';

import { getBlockSearchResults } from '../../src/block_search_flyout.js';
import { conditionSunBlocks } from '../../src/blocks/condition/condition_sun.js';
import '../../src/blocks/condition/condition_time.js';
import { setStudyRuntimeEntities } from '../../src/data/entities_index.js';
import { createToolbox, setToolboxEntities } from '../../src/toolbox.js';

Blockly.common.defineBlocks(conditionSunBlocks);

function categoryBlockTypes(toolbox, categoryName) {
  const category = toolbox.contents.find((item) => item.name === categoryName);
  return (category?.contents || [])
    .filter((item) => item.kind === 'block')
    .map((item) => item.type);
}

test('door state wording discovers Home Assistant door-related blocks through aliases', () => {
  setToolboxEntities([]);

  for (const query of ['door', 'open', 'opened', 'closed']) {
    const types = getBlockSearchResults(query).map((result) => result.type);
    assert.ok(types.includes('event_binary_sensor_state'), `${query}: binary sensor trigger`);
    assert.ok(types.includes('condition_state_binary_sensor'), `${query}: binary sensor condition`);
  }

  const doorTypes = getBlockSearchResults('door').map((result) => result.type);
  assert.ok(doorTypes.includes('action_lock'));
  assert.ok(doorTypes.includes('action_cover'));
});

test('partial and infix terms discover blocks while the user is typing', () => {
  const eventTypes = getBlockSearchResults('eve').map((result) => result.type);
  const conditionTypes = getBlockSearchResults('cond').map((result) => result.type);
  const singleLetterEventTypes = getBlockSearchResults('e').map((result) => result.type);
  const singleLetterDoorTypes = getBlockSearchResults('d').map((result) => result.type);

  assert.ok(eventTypes.length > 0);
  assert.ok(eventTypes.some((type) => type.startsWith('event_') || type.startsWith('ha_event_')));
  assert.ok(conditionTypes.length > 0);
  assert.ok(conditionTypes.some((type) => type.startsWith('condition_')));
  assert.ok(singleLetterEventTypes.some((type) => type.startsWith('event_') || type.startsWith('ha_event_')));
  assert.ok(singleLetterDoorTypes.includes('event_binary_sensor_state'));
});

test('runtime entity IDs and friendly names discover their applicable domain blocks', () => {
  setStudyRuntimeEntities([
    {
      entity_id: 'light.entrance',
      state: 'off',
      attributes: { friendly_name: 'Foyer Lamp' },
    },
  ]);

  const friendlyNameTypes = getBlockSearchResults('foyer').map((result) => result.type);
  const entityIdTypes = getBlockSearchResults('entrance').map((result) => result.type);

  assert.ok(friendlyNameTypes.includes('action_light'));
  assert.ok(entityIdTypes.includes('action_light'));
});

test('visible block dropdown choices are automatically searchable', () => {
  const nightTypes = getBlockSearchResults('night').map((result) => result.type);
  const polarTypes = getBlockSearchResults('polar').map((result) => result.type);
  const mondayTypes = getBlockSearchResults('mon').map((result) => result.type);

  assert.ok(nightTypes.includes('condition_sun_phase'));
  assert.ok(polarTypes.includes('condition_sun_phase'));
  assert.ok(mondayTypes.includes('condition_time_weekly'));
});

test('runtime semantic state labels are searchable for binary sensors', () => {
  setStudyRuntimeEntities([
    {
      entity_id: 'binary_sensor.entrance_motion',
      state: 'off',
      attributes: { friendly_name: 'Entrance Motion', device_class: 'motion' },
    },
  ]);

  const detectedTypes = getBlockSearchResults('detected').map((result) => result.type);
  assert.ok(detectedTypes.includes('event_binary_sensor_state'));
  assert.ok(detectedTypes.includes('condition_state_binary_sensor'));
});

test('supported entity blocks remain in the toolbox when runtime has no entities', () => {
  const emptyRuntimeToolbox = createToolbox([]);

  assert.ok(categoryBlockTypes(emptyRuntimeToolbox, 'Event').includes('event_binary_sensor_state'));
  assert.ok(categoryBlockTypes(emptyRuntimeToolbox, 'Condition').includes('condition_state_binary_sensor'));
  assert.ok(categoryBlockTypes(emptyRuntimeToolbox, 'Action').includes('action_light'));
  assert.ok(categoryBlockTypes(emptyRuntimeToolbox, 'Action').includes('action_lock'));
});
