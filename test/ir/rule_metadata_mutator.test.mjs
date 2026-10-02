import test from 'node:test';
import assert from 'node:assert/strict';
import * as Blockly from 'blockly';
import { setStudyRuntimeEntities } from '../../src/data/entities_index.js';

import '../../src/blocks/extensions.js';
import { ruleBlocks } from '../../src/blocks/rule_blocks.js';
import { ruleMetadataBlocks } from '../../src/blocks/rule_metadata.js';
import { rawLinesBlocks } from '../../src/blocks/raw_lines.js';
import { eventGroupBlocks } from '../../src/blocks/event/event_group.js';
import { actionEntityBlocks } from '../../src/blocks/action/action_entity.js';
import { actionDataBlocks } from '../../src/blocks/action/action_data.js';
import { yamlGenerator } from '../../src/generators/yaml.js';
import { yamlTextToInternalJson } from '../../src/import/yaml_import.js';

Blockly.common.defineBlocks(ruleBlocks);
Blockly.common.defineBlocks(ruleMetadataBlocks);
Blockly.common.defineBlocks(rawLinesBlocks);
Blockly.common.defineBlocks(eventGroupBlocks);
Blockly.common.defineBlocks(actionEntityBlocks);
Blockly.common.defineBlocks(actionDataBlocks);

setStudyRuntimeEntities([
  'binary_sensor.front_door',
  'light.entrance',
  'siren.test_siren',
].map((entity_id) => ({
  entity_id,
  state: 'off',
  attributes: { friendly_name: entity_id },
})));

test('EA and ECA rules hide metadata by default and expose it only through their mutator', () => {
  const workspace = new Blockly.Workspace();

  for (const type of ['event_action', 'event_condition_action']) {
    const rule = workspace.newBlock(type);

    assert.equal(rule.getInput('METADATA'), null);
    assert.deepEqual(rule.saveExtraState(), { hasMetadata: false });

    rule.setMetadataVisible_(true);
    assert.ok(rule.getInput('METADATA'));
    assert.deepEqual(rule.saveExtraState(), { hasMetadata: true });

    rule.setMetadataVisible_(false);
    assert.equal(rule.getInput('METADATA'), null);
  }
});

test('YAML generation works when a compact rule has no metadata input', () => {
  const workspace = new Blockly.Workspace();
  workspace.newBlock('event_action');

  assert.doesNotThrow(() => yamlGenerator.workspaceToCode(workspace));
});

test('raw metadata is emitted as a valid top-level YAML mapping', () => {
  const workspace = new Blockly.Workspace();
  const rule = workspace.newBlock('event_action');
  rule.setFieldValue('Metadata example', 'ALIAS');
  rule.setMetadataVisible_(true);

  const metadata = workspace.newBlock('ha_metadata_raw_lines');
  metadata.setFieldValue('mode: single\nvariables:\n  enabled: true', 'RAW_LINES');
  rule.getInput('METADATA').connection.connect(metadata.previousConnection);

  const yaml = yamlGenerator.workspaceToCode(workspace);
  assert.match(yaml, /^  mode: single$/m);
  assert.match(yaml, /^  variables:\n    enabled: true$/m);

  const parsed = yamlTextToInternalJson(yaml);
  assert.equal(parsed.mode, 'single');
  assert.deepEqual(parsed.variables, { enabled: true });
});

test('execution and max-exceeded metadata are independent blocks', () => {
  const workspace = new Blockly.Workspace();
  const rule = workspace.newBlock('event_action');
  rule.setFieldValue('Parallel example', 'ALIAS');
  rule.setMetadataVisible_(true);
  const execution = workspace.newBlock('ha_rule_execution');
  execution.setFieldValue('single', 'MODE');
  const maxExceeded = workspace.newBlock('ha_rule_max_exceeded');
  maxExceeded.setFieldValue('silent', 'MAX_EXCEEDED');
  rule.getInput('METADATA').connection.connect(execution.previousConnection);
  execution.nextConnection.connect(maxExceeded.previousConnection);

  assert.equal(execution.getFieldValue('MODE'), 'single');
  assert.equal(maxExceeded.getFieldValue('MAX_EXCEEDED'), 'silent');

  const parsed = yamlTextToInternalJson(yamlGenerator.workspaceToCode(workspace));
  assert.equal(parsed.mode, 'single');
  assert.equal(parsed.max_exceeded, 'silent');
});

test('execution policy exposes an optional max only for queued and parallel modes', () => {
  const workspace = new Blockly.Workspace();
  const execution = workspace.newBlock('ha_rule_execution');

  assert.equal(execution.getField('USE_MAX'), null);

  execution.setFieldValue('queued', 'MODE');
  execution.updateShape_();
  assert.ok(execution.getField('USE_MAX'));
  assert.equal(execution.getFieldValue('USE_MAX'), 'FALSE');
  assert.equal(execution.getField('MAX'), null);

  execution.setFieldValue('TRUE', 'USE_MAX');
  execution.updateShape_();
  execution.setFieldValue('25', 'MAX');
  assert.equal(execution.getFieldValue('MAX'), 25);

  const rule = workspace.newBlock('event_action');
  rule.setMetadataVisible_(true);
  rule.getInput('METADATA').connection.connect(execution.previousConnection);
  const parsed = yamlTextToInternalJson(yamlGenerator.workspaceToCode(workspace));
  assert.equal(parsed.mode, 'queued');
  assert.equal(parsed.max, 25);

  execution.setFieldValue('single', 'MODE');
  execution.updateShape_();
  assert.equal(execution.getField('USE_MAX'), null);
});

test('group state triggers keep sibling fields outside the entity_id array', () => {
  const workspace = new Blockly.Workspace();
  const rule = workspace.newBlock('event_action');
  const group = workspace.newBlock('event_group_entities');
  group.setFieldValue('binary_sensor', 'DOMAIN');
  group.setFieldValue('on', 'TO');
  rule.getInput('EVENT').connection.connect(group.previousConnection);

  const entityOptions = group.getField('DOMAIN').getOptions();
  assert.ok(entityOptions.some(([, value]) => value === 'binary_sensor'));
  const item = workspace.newBlock('event_group_entity_item');
  group.getInput('ENTITIES').connection.connect(item.previousConnection);
  const itemOptions = item.getField('ENTITY_ID').getOptions();
  const entityId = itemOptions.find(([, value]) => String(value).startsWith('binary_sensor.'))?.[1];
  assert.ok(entityId, 'an allowlisted binary sensor must be available for the group trigger test');
  item.setFieldValue(entityId, 'ENTITY_ID');

  const yaml = yamlGenerator.workspaceToCode(workspace);
  assert.match(yaml, /^    - trigger: state$/m);
  assert.match(yaml, /^      entity_id:\n        - binary_sensor\./m);
  assert.match(yaml, /^      to: 'on'$/m);

  const parsed = yamlTextToInternalJson(yaml);
  assert.deepEqual(parsed.triggers[0].entity_id, [entityId]);
  assert.equal(parsed.triggers[0].to, 'on');
});

test('typed entity actions keep target and data mappings structurally nested', () => {
  const workspace = new Blockly.Workspace();
  const rule = workspace.newBlock('event_action');
  const action = workspace.newBlock('action_light');
  action.setFieldValue('light.entrance', 'ENTITY_ID');
  action.setFieldValue('turn_on', 'ACTION');
  action.hasData_ = true;
  action.updateShape_();

  const transition = workspace.newBlock('action_data_transition');
  transition.setFieldValue(5, 'SECONDS');
  action.getInput('DATA').connection.connect(transition.previousConnection);
  rule.getInput('ACTION').connection.connect(action.previousConnection);

  const yaml = yamlGenerator.workspaceToCode(workspace);
  const parsed = yamlTextToInternalJson(yaml);
  assert.equal(parsed.actions[0].target.entity_id[0], 'light.entrance');
  assert.equal(parsed.actions[0].data.transition, 5);
});

test('generic action data keeps complete template text visible and preserves terminal newlines', () => {
  const workspace = new Blockly.Workspace();
  const rule = workspace.newBlock('event_action');
  const action = workspace.newBlock('action_light');
  action.setFieldValue('light.entrance', 'ENTITY_ID');
  action.setFieldValue('turn_on', 'ACTION');
  action.hasData_ = true;
  action.updateShape_();

  const data = workspace.newBlock('action_data_kv_text');
  const template = "{{ state_attr('input_select.holiday_color', 'options')\n  | list | random }}\n";
  data.setFieldValue('option', 'KEY');
  data.setFieldValue(template, 'VALUE');
  action.getInput('DATA').connection.connect(data.previousConnection);
  rule.getInput('ACTION').connection.connect(action.previousConnection);

  assert.equal(data.getField('VALUE').maxDisplayLength, Infinity);
  const parsed = yamlTextToInternalJson(yamlGenerator.workspaceToCode(workspace));
  assert.equal(parsed.actions[0].data.option, template);
});
