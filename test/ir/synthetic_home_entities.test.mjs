import test from 'node:test';
import assert from 'node:assert/strict';

import { dummyEntities as syntheticHomeEntities } from '../../src/data/entities_static.js';

test('Synthetic Home RT-BEH-001 fixture retains its canonical door and light entities', () => {
  const door = syntheticHomeEntities.find((entity) => entity.entity_id === 'binary_sensor.sb_test_door');
  const light = syntheticHomeEntities.find((entity) => entity.entity_id === 'light.sb_test_light');

  assert.equal(door.domain, 'binary_sensor');
  assert.equal(door.state, 'off');
  assert.equal(door.attributes.friendly_name, 'SB Test Door');
  assert.equal(door.attributes.device_class, 'door');

  assert.equal(light.domain, 'light');
  assert.equal(light.state, 'off');
  assert.equal(light.attributes.friendly_name, 'SB Test Light');
  assert.deepEqual(light.attributes.supported_color_modes, ['onoff']);
});
