import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createToolbox,
  refreshFlyoutAvailabilityStyles,
  setToolboxEntities,
} from '../../src/toolbox.js';
import {
  getToolboxBlockSortLabel,
  isToolboxBlockAvailable,
} from '../../src/toolbox_availability.js';

const runtimeEntities = [
  { entity_id: 'binary_sensor.back_door', state: 'off', attributes: { device_class: 'door' } },
  { entity_id: 'cover.bedroom_curtain', state: 'open', attributes: {} },
  { entity_id: 'light.bedroom', state: 'on', attributes: {} },
  { entity_id: 'person.test_user', state: 'home', attributes: {} },
  { entity_id: 'sensor.living_room_humidity', state: '58', attributes: {} },
  { entity_id: 'switch.dehumidifier', state: 'off', attributes: {} },
  { entity_id: 'notify.test_user', state: 'unknown', attributes: {} },
  { entity_id: 'zone.home', state: '1', attributes: {} },
];

function category(toolbox, name) {
  const result = toolbox.contents.find((item) => item.kind === 'category' && item.name === name);
  assert.ok(result, `missing ${name} category`);
  return result;
}

function sections(contents) {
  const result = [];
  let section = { label: '', blocks: [] };

  for (const item of contents) {
    if (item.kind === 'label') {
      if (section.blocks.length) result.push(section);
      section = { label: item.text, blocks: [] };
    } else if (item.kind === 'block') {
      section.blocks.push(item);
    }
  }
  if (section.blocks.length) result.push(section);
  return result;
}

function assertAvailabilityThenAlphabetical(blocks) {
  let sawUnavailable = false;
  let previousByAvailability = new Map();

  for (const block of blocks) {
    const available = isToolboxBlockAvailable(block.type, runtimeEntities);
    if (!available) sawUnavailable = true;
    if (available) assert.equal(sawUnavailable, false, `${block.type} appeared after an unavailable block`);

    const prior = previousByAvailability.get(available);
    const label = getToolboxBlockSortLabel(block.type);
    if (prior) {
      assert.ok(
        prior.localeCompare(label, 'en', { sensitivity: 'base' }) <= 0,
        `${label} should follow ${prior} in its availability group`
      );
    }
    previousByAvailability.set(available, label);
  }
}

test('toolbox keeps the agreed category and conceptual section order', () => {
  const toolbox = createToolbox(runtimeEntities);
  assert.deepEqual(toolbox.contents.map((item) => item.name), [
    'Rule', 'Trigger', 'Condition', 'Action',
  ]);
  assert.deepEqual(sections(category(toolbox, 'Trigger').contents).map((section) => section.label), [
    'State', 'Home Assistant', 'Event', 'MQTT', 'Group', 'Time', 'Template', 'Sun',
  ]);
  assert.deepEqual(sections(category(toolbox, 'Condition').contents).map((section) => section.label), [
    'State', 'Logic', 'Template', 'Time', 'Sun', 'Zone', 'Numeric State', 'Data',
  ]);
  assert.deepEqual(sections(category(toolbox, 'Action').contents).map((section) => section.label), [
    'Action', 'Group', 'MQTT', 'Data', 'Delay', 'Logic', 'Notify', 'Notify Tag',
  ]);
});

test('every toolbox section orders matching targets before no-target blocks, then A-Z', () => {
  const toolbox = createToolbox(runtimeEntities);
  for (const categoryName of ['Rule', 'Trigger', 'Condition', 'Action']) {
    for (const section of sections(category(toolbox, categoryName).contents)) {
      assertAvailabilityThenAlphabetical(section.blocks);
    }
  }
});

test('missing-entity blocks are retained after matching blocks', () => {
  const toolbox = createToolbox(runtimeEntities);
  const stateBlocks = sections(category(toolbox, 'Condition').contents)
    .find((section) => section.label === 'State').blocks;
  const types = stateBlocks.map((block) => block.type);

  assert.ok(types.includes('condition_state_light'));
  assert.ok(types.includes('condition_state_climate'));
  assert.ok(
    types.indexOf('condition_state_light') < types.indexOf('condition_state_climate'),
    'a matching light entity must appear before the missing climate entity'
  );
  assert.equal(isToolboxBlockAvailable('condition_state_climate', runtimeEntities), false);
});

test('unavailable styling is applied to any flyout but not inferred from workspace blocks', async () => {
  setToolboxEntities(runtimeEntities);
  const classes = new Map();
  const fakeBlock = (type) => ({
    type,
    getSvgRoot: () => ({
      classList: {
        toggle: (name, enabled) => classes.set(type, { name, enabled }),
      },
    }),
  });
  const fakeFlyout = {
    getWorkspace: () => ({
      getTopBlocks: () => [
        fakeBlock('condition_state_light'),
        fakeBlock('condition_state_climate'),
      ],
    }),
  };

  refreshFlyoutAvailabilityStyles(fakeFlyout);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(classes.get('condition_state_light'), {
    name: 'ha-toolbox-unavailable', enabled: false,
  });
  assert.deepEqual(classes.get('condition_state_climate'), {
    name: 'ha-toolbox-unavailable', enabled: true,
  });
});
