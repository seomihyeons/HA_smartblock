import assert from 'node:assert/strict';
import test from 'node:test';
import * as Blockly from 'blockly';

import '../../src/blocks/extensions.js';
import { ruleBlocks } from '../../src/blocks/rule_blocks.js';
import { yamlGenerator } from '../../src/generators/yaml.js';
import {
  generateScopedYaml,
  generateScopedYamlWithSourceMap,
  getDisconnectedBlockGroups,
} from '../../src/utils/automation_yaml_scope.js';

Blockly.common.defineBlocks(ruleBlocks);

Blockly.Blocks.test_scope_event = {
  init() {
    this.setPreviousStatement(true, 'HA_EVENT');
    this.setNextStatement(true, 'HA_EVENT');
  },
};

Blockly.Blocks.test_scope_loose = {
  init() {
    this.setPreviousStatement(true);
    this.setNextStatement(true);
  },
};

Blockly.Blocks.test_scope_condition = {
  init() {
    this.setPreviousStatement(true, 'HA_CONDITION');
    this.setNextStatement(true, 'HA_CONDITION');
  },
};

Blockly.Blocks.test_scope_action = {
  init() {
    this.setPreviousStatement(true, 'HA_ACTION');
    this.setNextStatement(true, 'HA_ACTION');
  },
};

yamlGenerator.forBlock.test_scope_event = () => '- trigger: connected_event\n';
yamlGenerator.forBlock.test_scope_loose = () => 'LOOSE_BLOCK_SHOULD_NOT_BE_EXPORTED\n';
yamlGenerator.forBlock.test_scope_condition = () => '- condition: connected_condition\n';
yamlGenerator.forBlock.test_scope_action = (block) => `- action: ${block.id}\n`;

function createWorkspace() {
  return new Blockly.Workspace();
}

test('keeps the existing all-top-block preview when no Rule exists', () => {
  const workspace = createWorkspace();
  workspace.newBlock('test_scope_loose');

  const scoped = generateScopedYaml(workspace);
  assert.match(scoped, /LOOSE_BLOCK_SHOULD_NOT_BE_EXPORTED/);
  assert.equal(getDisconnectedBlockGroups(workspace).length, 0);
  workspace.dispose();
});

test('shows no YAML for an empty Rule and excludes loose blocks', () => {
  const workspace = createWorkspace();
  workspace.newBlock('event_action');
  workspace.newBlock('test_scope_loose');

  assert.equal(generateScopedYaml(workspace), '');
  assert.equal(getDisconnectedBlockGroups(workspace).length, 1);
  workspace.dispose();
});

test('exports only Rule-connected content once a Rule exists', () => {
  const workspace = createWorkspace();
  const rule = workspace.newBlock('event_action');
  const event = workspace.newBlock('test_scope_event');
  const loose = workspace.newBlock('test_scope_loose');
  rule.getInput('EVENT').connection.connect(event.previousConnection);

  const scoped = generateScopedYaml(workspace);
  assert.match(scoped, /connected_event/);
  assert.doesNotMatch(scoped, /LOOSE_BLOCK_SHOULD_NOT_BE_EXPORTED/);
  assert.deepEqual(getDisconnectedBlockGroups(workspace), [loose]);
  workspace.dispose();
});

test('counts a disconnected next-block chain as one independent group', () => {
  const workspace = createWorkspace();
  workspace.newBlock('event_action');
  const first = workspace.newBlock('test_scope_loose');
  const second = workspace.newBlock('test_scope_loose');
  first.nextConnection.connect(second.previousConnection);

  assert.deepEqual(getDisconnectedBlockGroups(workspace), [first]);
  workspace.dispose();
});

test('maps Rule, Trigger, Condition, and Action blocks to marker-free YAML ranges', () => {
  const workspace = createWorkspace();
  const rule = workspace.newBlock('event_condition_action');
  const event = workspace.newBlock('test_scope_event');
  const condition = workspace.newBlock('test_scope_condition');
  const action = workspace.newBlock('test_scope_action');
  rule.getInput('EVENT').connection.connect(event.previousConnection);
  rule.getInput('CONDITION').connection.connect(condition.previousConnection);
  rule.getInput('ACTION').connection.connect(action.previousConnection);

  const traced = generateScopedYamlWithSourceMap(workspace);
  assert.equal(traced.yaml, generateScopedYaml(workspace));
  assert.doesNotMatch(traced.yaml, /\uE000|\uE001/);

  for (const [block, expected] of [
    [rule, /alias:/],
    [event, /connected_event/],
    [condition, /connected_condition/],
    [action, action.id],
  ]) {
    const range = traced.ranges.get(block.id);
    assert.ok(range, `expected a range for ${block.type}`);
    const mappedYaml = traced.yaml.slice(range.start, range.end);
    if (expected instanceof RegExp) assert.match(mappedYaml, expected);
    else assert.ok(mappedYaml.includes(expected));
  }
  workspace.dispose();
});

test('ends an Action range before the next Action in its statement chain', () => {
  const workspace = createWorkspace();
  const rule = workspace.newBlock('event_action');
  const firstAction = workspace.newBlock('test_scope_action');
  const secondAction = workspace.newBlock('test_scope_action');
  rule.getInput('ACTION').connection.connect(firstAction.previousConnection);
  firstAction.nextConnection.connect(secondAction.previousConnection);

  const traced = generateScopedYamlWithSourceMap(workspace);
  const firstRange = traced.ranges.get(firstAction.id);
  const secondRange = traced.ranges.get(secondAction.id);
  const ruleRange = traced.ranges.get(rule.id);

  assert.ok(traced.yaml.slice(firstRange.start, firstRange.end).includes(firstAction.id));
  assert.ok(!traced.yaml.slice(firstRange.start, firstRange.end).includes(secondAction.id));
  assert.ok(traced.yaml.slice(secondRange.start, secondRange.end).includes(secondAction.id));
  assert.ok(traced.yaml.slice(ruleRange.start, ruleRange.end).includes(firstAction.id));
  assert.ok(traced.yaml.slice(ruleRange.start, ruleRange.end).includes(secondAction.id));
  workspace.dispose();
});
