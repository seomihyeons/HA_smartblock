import assert from 'node:assert/strict';
import test from 'node:test';
import { executeInformationQuery } from '../information_query.mjs';

const cards = [
  { entity_id: 'light.living_main', friendly_name: 'Living Main', domain: 'light', area: 'Living Room', state: 'on', capability_attributes: {} },
  { entity_id: 'light.living_lamp', friendly_name: 'Living Lamp', domain: 'light', area: 'Living Room', state: 'off', capability_attributes: {} },
  { entity_id: 'fan.study', friendly_name: 'Study Fan', domain: 'fan', area: 'Study', state: 'on', capability_attributes: { percentage_step: 10 } },
];

test('counts a live domain collection without a special-purpose count query', () => {
  const result = executeInformationQuery(cards, {
    operation: 'entity_collection',
    target: { selector: 'entity_filter', filter: { domain: 'light' } },
    projection: ['display_name'], aggregation: 'count',
  });
  assert.equal(result.status, 'success');
  assert.equal(result.aggregate.count, 2);
});

test('lists filtered entities and reads an allowlisted capability attribute', () => {
  const list = executeInformationQuery(cards, {
    operation: 'entity_collection',
    target: { selector: 'entity_filter', filter: { domain: 'light', state: 'on' } },
    projection: ['display_name', 'state'],
  });
  assert.equal(list.entities.length, 1);
  assert.equal(list.entities[0].display_name, 'Living Main');

  const property = executeInformationQuery(cards, {
    operation: 'entity_property',
    target: { selector: 'entity', entity_id: 'fan.study' }, property: 'percentage_step',
  });
  assert.equal(property.entity.value, 10);
});
