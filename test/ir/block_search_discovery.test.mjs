import assert from 'node:assert/strict';
import test from 'node:test';

import { getBlockSearchResults } from '../../src/block_search_flyout.js';
import { createToolbox, setToolboxEntities } from '../../src/toolbox.js';

function categoryBlockTypes(toolbox, categoryName) {
  const category = toolbox.contents.find((item) => item.name === categoryName);
  return (category?.contents || [])
    .filter((item) => item.kind === 'block')
    .map((item) => item.type);
}

test('door search discovers Home Assistant door-related blocks through aliases', () => {
  setToolboxEntities([]);

  const types = getBlockSearchResults('door').map((result) => result.type);
  assert.ok(types.includes('event_binary_sensor_state'));
  assert.ok(types.includes('condition_state_binary_sensor'));
  assert.ok(types.includes('action_lock'));
  assert.ok(types.includes('action_cover'));
});

test('supported entity blocks remain in the toolbox when runtime has no entities', () => {
  const emptyRuntimeToolbox = createToolbox([]);

  assert.ok(categoryBlockTypes(emptyRuntimeToolbox, 'Event').includes('event_binary_sensor_state'));
  assert.ok(categoryBlockTypes(emptyRuntimeToolbox, 'Condition').includes('condition_state_binary_sensor'));
  assert.ok(categoryBlockTypes(emptyRuntimeToolbox, 'Action').includes('action_light'));
  assert.ok(categoryBlockTypes(emptyRuntimeToolbox, 'Action').includes('action_lock'));
});
