import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STUDY_ENTITY_IDS,
  filterStudyEntities,
  sanitizeStudyRuntimeEntities,
} from '../../src/data/study_entity_filter.js';
import {
  dummyEntities,
  notifyDevices,
  runtimeEntities,
  studyEntities,
  loadStudyRuntimeEntities,
  setStudyRuntimeEntities,
} from '../../src/data/entities_index.js';

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
  const result = setStudyRuntimeEntities([
    runtimeEntity('light.entrance'),
    runtimeEntity('binary_sensor.entrance_door'),
    runtimeEntity('person.test_user'),
    runtimeEntity('notify.test_user'),
    runtimeEntity('person.developer'),
    runtimeEntity('device_tracker.developer'),
    runtimeEntity('notify.developer_phone'),
  ]);

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

test('Entity selectors use visible names in English A-Z order with entity ID as a tie-breaker', () => {
  setStudyRuntimeEntities([
    { entity_id: 'light.zebra', state: 'on', attributes: { friendly_name: 'Alpha Lamp' } },
    { entity_id: 'light.beta', state: 'on', attributes: {} },
    { entity_id: 'light.alpha', state: 'on', attributes: { friendly_name: 'Zulu Lamp' } },
    { entity_id: 'light.alpha_2', state: 'on', attributes: { friendly_name: 'Zulu Lamp' } },
  ]);

  assert.deepEqual(dummyEntities.map((entity) => entity.entity_id), [
    'light.zebra',
    'light.beta',
    'light.alpha',
    'light.alpha_2',
  ]);
});

test('runtime fetch keeps non-study Home Assistant entities for generic selectors', async () => {
  const extras = Array.from({ length: 300 }, (_, index) => runtimeEntity(`sensor.extra_${index}`));
  const result = await loadStudyRuntimeEntities(async () => ({
    ok: true,
    json: async () => ({ entities: [...STUDY_ENTITY_IDS.map(runtimeEntity), ...extras] }),
  }));

  assert.equal(result.ok, true);
  assert.equal(dummyEntities.length, STUDY_ENTITY_IDS.length + extras.length);
  assert.equal(runtimeEntities.length, STUDY_ENTITY_IDS.length + extras.length);
  assert.deepEqual(studyEntities.map((entity) => entity.entity_id), STUDY_ENTITY_IDS);
  assert.deepEqual(result.entities.map((entity) => entity.entity_id), STUDY_ENTITY_IDS);
  assert.ok(dummyEntities.some((entity) => entity.entity_id === 'sensor.extra_299'));
});

test('runtime fetch failure leaves runtime and study selectors empty', async () => {
  setStudyRuntimeEntities(STUDY_ENTITY_IDS.map(runtimeEntity));
  const result = await loadStudyRuntimeEntities(async () => {
    throw new Error('Home Assistant unavailable');
  });

  assert.equal(result.ok, false);
  assert.deepEqual(dummyEntities, []);
  assert.deepEqual(runtimeEntities, []);
  assert.deepEqual(studyEntities, []);
  assert.equal(result.missing.length, STUDY_ENTITY_IDS.length);
});
