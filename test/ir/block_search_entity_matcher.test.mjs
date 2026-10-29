import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSearchEntityBinding,
  selectSearchEntity,
} from '../../src/block_search_entity_matcher.js';

const entities = [
  {
    entity_id: 'binary_sensor.entrance_motion',
    state: 'off',
    attributes: { friendly_name: 'Entrance Motion', device_class: 'motion' },
  },
  {
    entity_id: 'binary_sensor.bedroom_motion',
    state: 'off',
    attributes: { friendly_name: 'Bedroom Motion', device_class: 'motion' },
  },
  {
    entity_id: 'light.entrance',
    state: 'off',
    attributes: { friendly_name: 'Entrance Light' },
  },
  {
    entity_id: 'sensor.living_room_humidity',
    state: '58',
    attributes: { friendly_name: 'Living Room Humidity', unit_of_measurement: '%' },
  },
];

test('general Entity search seeds one compatible Entity by score then English A-Z', () => {
  assert.deepEqual(
    selectSearchEntity('event_binary_sensor_state', 'motion', entities),
    { field: 'ENTITY_ID', entityId: 'binary_sensor.bedroom_motion', score: 1000 }
  );

  assert.deepEqual(
    selectSearchEntity('condition_state_binary_sensor', 'Entrance Motion', entities),
    { field: 'ENTITY_ID', entityId: 'binary_sensor.entrance_motion', score: 1000 }
  );
});

test('Entity seeding never crosses a block domain', () => {
  assert.equal(selectSearchEntity('event_binary_sensor_state', 'Entrance Light', entities), null);
  assert.deepEqual(
    selectSearchEntity('action_light', 'Entrance', entities),
    { field: 'ENTITY_ID', entityId: 'light.entrance', score: 800 }
  );
});

test('short and feature-only queries do not silently select an Entity', () => {
  assert.equal(selectSearchEntity('event_binary_sensor_state', 'mo', entities), null);
  assert.equal(selectSearchEntity('action_light', 'turn on', entities), null);
});

test('numeric blocks only accept entities compatible with their selector', () => {
  assert.deepEqual(
    selectSearchEntity('condition_numeric_state_entity', 'humidity', entities),
    { field: 'ENTITY_ID', entityId: 'sensor.living_room_humidity', score: 800 }
  );
  assert.equal(selectSearchEntity('condition_numeric_state_entity', 'Entrance Motion', entities), null);
});

test('only blocks with a single explicit target field receive an Entity binding', () => {
  assert.equal(getSearchEntityBinding('event_action'), null);
  assert.equal(getSearchEntityBinding('ha_event_time_pattern'), null);
  assert.equal(getSearchEntityBinding('action_group_entities'), null);
});
