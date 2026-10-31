import assert from 'node:assert/strict';
import test from 'node:test';
import * as Blockly from 'blockly';

import '../../src/blocks/extensions.js';
import { ruleBlocks } from '../../src/blocks/rule_blocks.js';
import {
  setNumericStateEntityMode,
} from '../../src/blocks/condition/condition_numeric_state_entity.js';
import { setStudyRuntimeEntities } from '../../src/data/entities_index.js';
import { yamlGenerator } from '../../src/generators/yaml.js';
import { renderAutomationToWorkspace } from '../../src/import/yamlToBlocks.js';

Blockly.common.defineBlocks(ruleBlocks);

// yamlToBlocks explicitly initializes SVGs. The IR tests use a headless
// workspace, so provide no-op view hooks while still exercising the importer
// and its legacy USE_ABOVE/USE_BELOW mapping.
if (!Blockly.Block.prototype.initSvg) Blockly.Block.prototype.initSvg = () => {};
if (!Blockly.Block.prototype.render) Blockly.Block.prototype.render = () => {};

function setRuntimeNumericEntity() {
  setStudyRuntimeEntities([{
    entity_id: 'sensor.living_room_humidity',
    state: '72.5',
    attributes: { friendly_name: 'Living Room Humidity', unit_of_measurement: '%' },
  }, {
    entity_id: 'sensor.unitless_counter',
    state: '3',
    attributes: { friendly_name: 'Unitless Counter' },
  }]);
}

function createNumericStateBlock() {
  setRuntimeNumericEntity();
  const workspace = new Blockly.Workspace();
  const block = workspace.newBlock('condition_numeric_state_entity');
  block.setFieldValue('sensor.living_room_humidity', 'ENTITY_ID');
  return { workspace, block };
}

function generateCondition(block) {
  return yamlGenerator.forBlock.condition_numeric_state_entity(block);
}

test('numeric state mode selector emits Above, Below, and Between YAML including zero', () => {
  const { workspace, block } = createNumericStateBlock();
  block.setFieldValue('0', 'ABOVE');
  block.setFieldValue('90', 'BELOW');

  setNumericStateEntityMode(block, 'ABOVE');
  assert.match(generateCondition(block), /above: 0/);
  assert.doesNotMatch(generateCondition(block), /below:/);
  assert.ok(block.getField('THRESHOLD_PRIMARY'));
  assert.equal(block.getField('THRESHOLD_SECONDARY'), null);
  assert.equal(String(block.getField('THRESHOLD_PRIMARY').getValue()), '0');

  setNumericStateEntityMode(block, 'BELOW');
  assert.doesNotMatch(generateCondition(block), /above:/);
  assert.match(generateCondition(block), /below: 90/);
  assert.ok(block.getField('THRESHOLD_PRIMARY'));
  assert.equal(block.getField('THRESHOLD_SECONDARY'), null);
  assert.equal(String(block.getField('THRESHOLD_PRIMARY').getValue()), '90');

  setNumericStateEntityMode(block, 'BETWEEN');
  assert.match(generateCondition(block), /above: 0/);
  assert.match(generateCondition(block), /below: 90/);
  assert.ok(block.getField('THRESHOLD_PRIMARY'));
  assert.ok(block.getField('THRESHOLD_AND'));
  assert.ok(block.getField('THRESHOLD_SECONDARY'));
  workspace.dispose();
});

test('legacy threshold fields retain their values and mode through serialization', () => {
  const { workspace: source, block } = createNumericStateBlock();
  block.setFieldValue('75', 'ABOVE');
  block.setFieldValue('90', 'BELOW');
  setNumericStateEntityMode(block, 'BETWEEN');

  const state = Blockly.serialization.workspaces.save(source);
  assert.doesNotMatch(JSON.stringify(state), /THRESHOLD_(PRIMARY|SECONDARY|AND|UNIT)/);
  const restored = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(state, restored, false);
  const restoredBlock = restored.getAllBlocks(false).find((candidate) => candidate.type === 'condition_numeric_state_entity');

  assert.equal(restoredBlock.getFieldValue('USE_ABOVE'), 'TRUE');
  assert.equal(restoredBlock.getFieldValue('USE_BELOW'), 'TRUE');
  assert.equal(String(restoredBlock.getFieldValue('ABOVE')), '75');
  assert.equal(String(restoredBlock.getFieldValue('BELOW')), '90');
  assert.match(generateCondition(restoredBlock), /above: 75/);
  assert.match(generateCondition(restoredBlock), /below: 90/);

  source.dispose();
  restored.dispose();
});

test('visible threshold inputs write back to the legacy YAML fields', () => {
  const { workspace, block } = createNumericStateBlock();

  setNumericStateEntityMode(block, 'BELOW');
  block.getField('THRESHOLD_PRIMARY').setValue(25);
  assert.equal(String(block.getFieldValue('BELOW')), '25');

  setNumericStateEntityMode(block, 'BETWEEN');
  block.getField('THRESHOLD_PRIMARY').setValue(75);
  block.getField('THRESHOLD_SECONDARY').setValue(90);
  assert.equal(String(block.getFieldValue('ABOVE')), '75');
  assert.equal(String(block.getFieldValue('BELOW')), '90');
  assert.match(generateCondition(block), /above: 75/);
  assert.match(generateCondition(block), /below: 90/);
  workspace.dispose();
});

test('numeric state condition displays the selected entity unit without changing YAML', () => {
  const { workspace, block } = createNumericStateBlock();

  setNumericStateEntityMode(block, 'ABOVE');
  assert.equal(block.getField('THRESHOLD_UNIT').getText(), '%');
  assert.doesNotMatch(generateCondition(block), /%/);

  block.setFieldValue('sensor.unitless_counter', 'ENTITY_ID');
  assert.equal(block.getField('THRESHOLD_UNIT'), null);

  block.setFieldValue('sensor.living_room_humidity', 'ENTITY_ID');
  setNumericStateEntityMode(block, 'BETWEEN');
  assert.equal(block.getField('THRESHOLD_UNIT').getText(), '%');
  workspace.dispose();
});

test('a legacy block with neither threshold enabled remains semantically unchanged', () => {
  const { workspace, block } = createNumericStateBlock();
  block.setFieldValue('12', 'ABOVE');
  block.setFieldValue('34', 'BELOW');

  assert.equal(block.getFieldValue('USE_ABOVE'), 'FALSE');
  assert.equal(block.getFieldValue('USE_BELOW'), 'FALSE');
  assert.doesNotMatch(generateCondition(block), /above:|below:/);
  assert.equal(block.getField('THRESHOLD_PRIMARY'), null);
  assert.equal(block.getField('THRESHOLD_SECONDARY'), null);
  workspace.dispose();
});

test('numeric-state YAML import maps legacy flags to the matching segmented mode', () => {
  setRuntimeNumericEntity();
  const workspace = new Blockly.Workspace();
  renderAutomationToWorkspace(workspace, {
    alias: 'Numeric state import',
    conditions: [{
      condition: 'numeric_state',
      entity_id: 'sensor.living_room_humidity',
      above: 75,
      below: 90,
    }],
    actions: [],
  });

  const block = workspace.getAllBlocks(false).find((candidate) => candidate.type === 'condition_numeric_state_entity');
  assert.ok(block);
  assert.equal(block.getFieldValue('USE_ABOVE'), 'TRUE');
  assert.equal(block.getFieldValue('USE_BELOW'), 'TRUE');
  assert.ok(block.getField('THRESHOLD_AND'));
  assert.equal(block.getField('THRESHOLD_UNIT').getText(), '%');
  assert.match(generateCondition(block), /above: 75/);
  assert.match(generateCondition(block), /below: 90/);
  workspace.dispose();
});
