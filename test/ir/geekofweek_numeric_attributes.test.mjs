import test from 'node:test';
import assert from 'node:assert/strict';

import { dummyEntities as geekOfWeekEntities } from '../../src/data/entities_geekofweek.js';
import {
  getNumericAttributeEntityOptions,
  getNumericAttributeOptions,
} from '../../src/blocks/condition/condition_numeric_state_attribute.js';

test('GeekOfWeek numeric attributes remain eligible for numeric-state regression coverage', () => {
  const entityOptions = getNumericAttributeEntityOptions(geekOfWeekEntities);
  assert.ok(
    entityOptions.some(([, entityId]) => entityId === 'weather.REDACTED'),
    'weather.REDACTED must be eligible for numeric attribute conditions',
  );

  const attributeOptions = getNumericAttributeOptions('weather.REDACTED', geekOfWeekEntities);
  assert.ok(
    attributeOptions.some(([, attribute]) => attribute === 'wind_speed'),
    'wind_speed must be selectable for the GeekOfWeek weather entity',
  );
});
