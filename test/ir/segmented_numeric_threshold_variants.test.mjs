import assert from 'node:assert/strict';
import test from 'node:test';
import * as Blockly from 'blockly';

import '../../src/blocks/extensions.js';
import { eventGroupBlocks } from '../../src/blocks/event/event_group.js';
import '../../src/blocks/condition/condition_numeric_state_attribute.js';
import { setStudyRuntimeEntities } from '../../src/data/entities_index.js';
import { yamlGenerator } from '../../src/generators/yaml.js';
import { setThresholdMode } from '../../src/blocks/utils/segmented_numeric_threshold.js';

Blockly.common.defineBlocks(eventGroupBlocks);

function setRuntimeEntities() {
  setStudyRuntimeEntities([{
    entity_id: 'sensor.room_climate',
    state: '20',
    attributes: { friendly_name: 'Room Climate', humidity: '55', temperature: '20' },
  }, {
    entity_id: 'sensor.group_member',
    state: '10',
    attributes: { friendly_name: 'Group Member' },
  }]);
}

function firstAvailableValue(field) {
  return field.getOptions().find(([, value]) => value)?.[1] || '';
}

test('numeric attribute condition uses segmented modes while preserving zero YAML thresholds', () => {
  setRuntimeEntities();
  const workspace = new Blockly.Workspace();
  const block = workspace.newBlock('condition_numeric_state_attribute');
  const entityId = firstAvailableValue(block.getField('ENTITY_ID'));
  block.setFieldValue(entityId, 'ENTITY_ID');
  const attribute = firstAvailableValue(block.getField('ATTRIBUTE'));
  block.setFieldValue(attribute, 'ATTRIBUTE');
  block.setFieldValue('0', 'ABOVE');
  block.setFieldValue('90', 'BELOW');

  setThresholdMode(block, 'ABOVE');
  let yaml = yamlGenerator.forBlock.condition_numeric_state_attribute(block);
  assert.match(yaml, /above: 0/);
  assert.doesNotMatch(yaml, /below:/);

  setThresholdMode(block, 'BETWEEN');
  yaml = yamlGenerator.forBlock.condition_numeric_state_attribute(block);
  assert.match(yaml, /above: 0/);
  assert.match(yaml, /below: 90/);
  assert.ok(block.getField('THRESHOLD_SECONDARY'));
  workspace.dispose();
});

test('group numeric trigger starts without a threshold and supports zero Above', () => {
  setRuntimeEntities();
  const workspace = new Blockly.Workspace();
  const block = workspace.newBlock('event_group_numeric_entities');
  const child = workspace.newBlock('event_group_entity_item');
  block.getInput('ENTITIES').connection.connect(child.previousConnection);
  child.setFieldValue(firstAvailableValue(child.getField('ENTITY_ID')), 'ENTITY_ID');

  assert.equal(block.getFieldValue('USE_ABOVE'), 'FALSE');
  assert.equal(block.getFieldValue('USE_BELOW'), 'FALSE');
  assert.equal(String(block.getFieldValue('BELOW')), '30');
  assert.equal(yamlGenerator.forBlock.event_group_numeric_entities(block, yamlGenerator), '');

  setThresholdMode(block, 'BETWEEN');
  block.setFieldValue('0', 'ABOVE');
  block.setFieldValue('30', 'BELOW');
  const yaml = yamlGenerator.forBlock.event_group_numeric_entities(block, yamlGenerator);
  assert.match(yaml, /above: 0/);
  assert.match(yaml, /below: 30/);
  assert.ok(block.getField('THRESHOLD_SECONDARY'));
  workspace.dispose();
});
