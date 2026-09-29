import test from 'node:test';
import assert from 'node:assert/strict';
import * as Blockly from 'blockly';

import '../../src/blocks/condition/condition_numeric_state_attribute.js';

test('GOW numeric_state attributes populate the numeric attribute condition dropdowns', () => {
  const workspace = new Blockly.Workspace();
  const block = workspace.newBlock('condition_numeric_state_attribute');

  const entityOptions = block.getField('ENTITY_ID').getOptions();
  assert.ok(
    entityOptions.some(([, entityId]) => entityId === 'weather.REDACTED'),
    'weather.REDACTED must be eligible for numeric attribute conditions',
  );

  block.setFieldValue('weather.REDACTED', 'ENTITY_ID');
  const attributeOptions = block.getField('ATTRIBUTE').getOptions();
  assert.ok(
    attributeOptions.some(([, attribute]) => attribute === 'wind_speed'),
    'wind_speed must be selectable after the weather entity is selected',
  );
});
