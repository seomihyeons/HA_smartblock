import assert from 'node:assert/strict';
import test from 'node:test';
import { STUDY_ENTITY_IDS, filterStudyEntities } from '../../src/data/study_entity_filter.js';
import {
  dummyEntities,
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

test('runtime entities stay available while the 17-entity study set remains separate', () => {
  const result = setStudyRuntimeEntities([
    runtimeEntity('light.entrance'),
    runtimeEntity('binary_sensor.front_door'),
    runtimeEntity('person.developer'),
  ]);

  assert.deepEqual(
    dummyEntities.map((entity) => entity.entity_id),
    ['binary_sensor.front_door', 'light.entrance', 'person.developer']
  );
  assert.deepEqual(
    runtimeEntities.map((entity) => entity.entity_id),
    ['binary_sensor.front_door', 'light.entrance', 'person.developer']
  );
  assert.deepEqual(
    studyEntities.map((entity) => entity.entity_id),
    ['binary_sensor.front_door', 'light.entrance']
  );
  assert.deepEqual(
    result.entities.map((entity) => entity.entity_id),
    ['binary_sensor.front_door', 'light.entrance']
  );
  assert.equal(result.missing.length, STUDY_ENTITY_IDS.length - 2);
  assert.ok(result.missing.includes('siren.home_alarm'));
  assert.ok(result.missing.includes('binary_sensor.bedroom_door'));
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
