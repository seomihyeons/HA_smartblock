import assert from 'node:assert/strict';
import test from 'node:test';
import * as Blockly from 'blockly';

import '../../src/blocks/extensions.js';
import {
  eventEntityBlocks,
  setNumericStateTriggerMode,
} from '../../src/blocks/event/event_entity.js';
import { ruleBlocks } from '../../src/blocks/rule_blocks.js';
import { setStudyRuntimeEntities } from '../../src/data/entities_index.js';
import { yamlGenerator } from '../../src/generators/yaml.js';
import { renderAutomationToWorkspace } from '../../src/import/yamlToBlocks.js';

Blockly.common.defineBlocks(eventEntityBlocks);
Blockly.common.defineBlocks(ruleBlocks);

if (!Blockly.Block.prototype.initSvg) Blockly.Block.prototype.initSvg = () => {};
if (!Blockly.Block.prototype.render) Blockly.Block.prototype.render = () => {};

function setRuntimeNumericEntity() {
  setStudyRuntimeEntities([{
    entity_id: 'sensor.freezing_point',
    state: '0',
    attributes: { friendly_name: 'Freezing Point' },
  }]);
}

function createTrigger() {
  setRuntimeNumericEntity();
  const workspace = new Blockly.Workspace();
  const block = workspace.newBlock('event_sensor_numeric_state');
  block.setFieldValue('sensor.freezing_point', 'ENTITY_ID');
  return { workspace, block };
}

function generateTrigger(block) {
  return yamlGenerator.forBlock.event_sensor_numeric_state(block, yamlGenerator);
}

test('numeric-state trigger preserves zero as an active Above, Below, or Between threshold', () => {
  const { workspace, block } = createTrigger();
  block.setFieldValue('0', 'ABOVE');
  block.setFieldValue('10', 'BELOW');

  setNumericStateTriggerMode(block, 'ABOVE');
  assert.match(generateTrigger(block), /above: 0/);
  assert.doesNotMatch(generateTrigger(block), /below:/);
  assert.equal(block.getField('THRESHOLD_SECONDARY'), null);

  setNumericStateTriggerMode(block, 'BELOW');
  assert.doesNotMatch(generateTrigger(block), /above:/);
  assert.match(generateTrigger(block), /below: 10/);

  setNumericStateTriggerMode(block, 'BETWEEN');
  assert.match(generateTrigger(block), /above: 0/);
  assert.match(generateTrigger(block), /below: 10/);
  assert.ok(block.getField('THRESHOLD_SECONDARY'));
  workspace.dispose();
});

test('a trigger without a selected threshold does not emit invalid YAML', () => {
  const { workspace, block } = createTrigger();
  assert.equal(block.getFieldValue('USE_ABOVE'), 'FALSE');
  assert.equal(block.getFieldValue('USE_BELOW'), 'FALSE');
  assert.equal(block.getInput('THRESHOLD_UI'), null);
  assert.equal(block.inputList[0].name, 'FOR');
  assert.equal(block.inputList[0].connection?.getCheck(), null);
  assert.equal(block.inputsInline, false);
  assert.equal(block.getField('ENTITY_ID').getSourceBlock().getInput('FOR'), block.getInput('FOR'));
  assert.equal(generateTrigger(block), '');
  workspace.dispose();
});

test('numeric-state trigger imports explicit zero thresholds', () => {
  setRuntimeNumericEntity();
  const workspace = new Blockly.Workspace();
  renderAutomationToWorkspace(workspace, {
    alias: 'Zero threshold trigger',
    triggers: [{
      trigger: 'numeric_state',
      entity_id: 'sensor.freezing_point',
      above: 0,
    }],
    actions: [],
  });

  const block = workspace.getAllBlocks(false)
    .find((candidate) => candidate.type === 'event_sensor_numeric_state');
  assert.ok(block);
  assert.equal(block.getFieldValue('USE_ABOVE'), 'TRUE');
  assert.equal(block.getFieldValue('USE_BELOW'), 'FALSE');
  assert.equal(String(block.getFieldValue('ABOVE')), '0');
  assert.match(generateTrigger(block), /above: 0/);
  workspace.dispose();
});

test('pre-mode workspaces migrate their non-zero numeric-state thresholds once', async () => {
  const { workspace: source, block } = createTrigger();
  block.setFieldValue('12', 'ABOVE');
  block.setFieldValue('30', 'BELOW');
  const state = Blockly.serialization.workspaces.save(source);
  const stateBlock = state.blocks.blocks.find((candidate) => candidate.type === 'event_sensor_numeric_state');
  delete stateBlock.fields.USE_ABOVE;
  delete stateBlock.fields.USE_BELOW;

  const restored = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(state, restored, false);
  await Promise.resolve();

  const restoredBlock = restored.getAllBlocks(false)
    .find((candidate) => candidate.type === 'event_sensor_numeric_state');
  assert.equal(restoredBlock.getFieldValue('USE_ABOVE'), 'TRUE');
  assert.equal(restoredBlock.getFieldValue('USE_BELOW'), 'TRUE');
  assert.match(generateTrigger(restoredBlock), /above: 12/);
  assert.match(generateTrigger(restoredBlock), /below: 30/);

  source.dispose();
  restored.dispose();
});
