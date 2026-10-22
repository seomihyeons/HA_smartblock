import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STUDY_ENTITY_IDS,
  filterStudyEntities,
  sanitizeStudyRuntimeEntities,
} from '../../src/data/study_entity_filter.js';

const runtimeEntity = (entity_id) => ({
  entity_id,
  state: 'on',
  attributes: { friendly_name: entity_id },
});

test('study filter accepts only the 17 allowlisted entity IDs', () => {
  const result = filterStudyEntities([
    ...STUDY_ENTITY_IDS.map(runtimeEntity),
    runtimeEntity('sun.sun'),
    runtimeEntity('weather.home'),
    runtimeEntity('light.sb_test_light'),
    runtimeEntity('sensor.extra_001'),
  ]);

  assert.deepEqual(result.entities.map((entity) => entity.entity_id), STUDY_ENTITY_IDS);
  assert.deepEqual(result.missing, []);
});

test('runtime entities retain generic Home Assistant entities while excluding non-study users', () => {
  const sanitized = sanitizeStudyRuntimeEntities([
    runtimeEntity('light.entrance'),
    runtimeEntity('binary_sensor.entrance_door'),
    runtimeEntity('person.test_user'),
    runtimeEntity('notify.test_user'),
    runtimeEntity('person.developer'),
    runtimeEntity('device_tracker.developer'),
    runtimeEntity('notify.developer_phone'),
  ]);

  const dummyEntities = sanitized.entities;
  const runtimeEntities = sanitized.entities;
  const result = filterStudyEntities(runtimeEntities);
  const studyEntities = result.entities;
  const notifyDevices = runtimeEntities.filter((entity) => entity.domain === 'notify').map((entity) => entity.entity_id);

  assert.deepEqual(
    dummyEntities.map((entity) => entity.entity_id),
    ['binary_sensor.entrance_door', 'light.entrance', 'notify.test_user', 'person.test_user']
  );
  assert.deepEqual(
    runtimeEntities.map((entity) => entity.entity_id),
    ['binary_sensor.entrance_door', 'light.entrance', 'notify.test_user', 'person.test_user']
  );
  assert.deepEqual(
    studyEntities.map((entity) => entity.entity_id),
    ['binary_sensor.entrance_door', 'light.entrance', 'person.test_user', 'notify.test_user']
  );
  assert.deepEqual(
    result.entities.map((entity) => entity.entity_id),
    ['binary_sensor.entrance_door', 'light.entrance', 'person.test_user', 'notify.test_user']
  );
  assert.equal(result.missing.length, STUDY_ENTITY_IDS.length - 4);
  assert.ok(result.missing.includes('switch.dehumidifier'));
  assert.ok(result.missing.includes('binary_sensor.bedroom_door'));
  assert.deepEqual(notifyDevices, ['notify.test_user']);
});

test('runtime sanitization removes every non-test user and notification device', () => {
  const result = sanitizeStudyRuntimeEntities([
    runtimeEntity('person.test_user'),
    runtimeEntity('notify.test_user'),
    runtimeEntity('device_tracker.admin'),
    runtimeEntity('notify.admin_phone'),
    runtimeEntity('person.admin'),
    runtimeEntity('light.entrance'),
  ]);

  assert.deepEqual(result.entities.map((entity) => entity.entity_id), [
    'light.entrance',
    'notify.test_user',
    'person.test_user',
  ]);
});
