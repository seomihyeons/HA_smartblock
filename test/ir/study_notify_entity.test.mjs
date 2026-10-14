import assert from 'node:assert/strict';
import test from 'node:test';
import * as Blockly from 'blockly';

import { actionNotifyBlocks } from '../../src/blocks/action/action_notify.js';
import { setStudyRuntimeEntities } from '../../src/data/entities_index.js';
import { yamlGenerator } from '../../src/generators/yaml.js';
import { createActionNode } from '../../src/import/blocks/action_mapper.js';
import { toolbox } from '../../src/toolbox.js';

Blockly.common.defineBlocks(actionNotifyBlocks);

function setStudyEntities() {
  setStudyRuntimeEntities([
    { entity_id: 'notify.test_user', state: 'unknown', attributes: { friendly_name: 'Test User' } },
    { entity_id: 'notify.other_user', state: 'unknown', attributes: { friendly_name: 'Other User' } },
  ]);
}

test('notify.test_user generates notify.send_message with an entity target', () => {
  setStudyEntities();
  const workspace = new Blockly.Workspace();
  const notify = workspace.newBlock('action_notify');
  notify.setFieldValue('notify.test_user', 'TARGET');
  const message = workspace.newBlock('action_notify_message_text');
  message.setFieldValue('Entrance door opened', 'TEXT');
  notify.getInput('MESSAGE_BLOCKS').connection.connect(message.previousConnection);

  assert.equal(
    yamlGenerator.blockToCode(notify),
    '- action: notify.send_message\n  target:\n    entity_id: notify.test_user\n  data:\n    message: "Entrance door opened"\n'
  );
  workspace.dispose();
});

test('a newly dragged notify block is seeded with a message-entry prompt', () => {
  const actionCategory = toolbox.contents.find((item) => item.kind === 'category' && item.name === 'Action');
  const notifyDefinition = actionCategory.contents.find((item) => item.type === 'action_notify');

  assert.deepEqual(notifyDefinition.inputs, {
    MESSAGE_BLOCKS: {
      block: {
        type: 'action_notify_message_text',
        fields: { TEXT: 'input message' },
      },
    },
  });

  setStudyEntities();
  const workspace = new Blockly.Workspace();
  const notify = workspace.newBlock('action_notify');
  notify.setFieldValue('notify.test_user', 'TARGET');
  const message = workspace.newBlock('action_notify_message_text');
  message.setFieldValue('input message', 'TEXT');
  const messageField = message.getField('TEXT');
  assert.equal(messageField.constructor.name, 'NotifyMessageTextInput');
  assert.equal(messageField.isPlaceholder(), true);
  notify.getInput('MESSAGE_BLOCKS').connection.connect(message.previousConnection);

  assert.equal(
    yamlGenerator.blockToCode(notify),
    ''
  );
  workspace.dispose();
});

test('a real notify message replaces the placeholder field value', () => {
  const workspace = new Blockly.Workspace();
  const message = workspace.newBlock('action_notify_message_text');
  message.setFieldValue('Entrance door opened', 'TEXT');

  assert.equal(message.getFieldValue('TEXT'), 'Entrance door opened');
  assert.equal(message.getField('TEXT').isPlaceholder(), false);
  workspace.dispose();
});

test('a user-entered message equal to the prompt is still exported', () => {
  setStudyEntities();
  const workspace = new Blockly.Workspace();
  const notify = workspace.newBlock('action_notify');
  notify.setFieldValue('notify.test_user', 'TARGET');
  const message = workspace.newBlock('action_notify_message_text');
  message.setFieldValue('input message', 'TEXT');
  message.getField('TEXT').markAsUserValue();
  notify.getInput('MESSAGE_BLOCKS').connection.connect(message.previousConnection);

  assert.equal(message.getField('TEXT').isPlaceholder(), false);
  assert.equal(
    yamlGenerator.blockToCode(notify),
    '- action: notify.send_message\n  target:\n    entity_id: notify.test_user\n  data:\n    message: "input message"\n'
  );
  workspace.dispose();
});

test('notify placeholder state survives workspace serialization', () => {
  const source = new Blockly.Workspace();
  const prompt = source.newBlock('action_notify_message_text');
  const entered = source.newBlock('action_notify_message_text');
  entered.setFieldValue('input message', 'TEXT');
  entered.getField('TEXT').markAsUserValue();
  const state = Blockly.serialization.workspaces.save(source);

  const restored = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(state, restored, false);
  const fields = restored.getAllBlocks(false).map((block) => block.getField('TEXT'));
  assert.equal(fields.filter((field) => field.isPlaceholder()).length, 1);
  assert.equal(fields.filter((field) => !field.isPlaceholder()).length, 1);

  source.dispose();
  restored.dispose();
});

test('notify.send_message imports to the same test-user notify block', () => {
  setStudyEntities();
  const workspace = new Blockly.Workspace();
  const notify = createActionNode({
    action: 'notify.send_message',
    target: { entity_id: 'notify.test_user' },
    data: { message: 'Entrance door opened' },
  }, workspace);

  assert.equal(notify?.type, 'action_notify');
  assert.equal(notify?.getFieldValue('TARGET'), 'notify.test_user');
  assert.equal(
    yamlGenerator.blockToCode(notify),
    '- action: notify.send_message\n  target:\n    entity_id: notify.test_user\n  data:\n    message: "Entrance door opened"\n'
  );
  workspace.dispose();
});
