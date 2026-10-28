import assert from 'node:assert/strict';
import test from 'node:test';
import * as Blockly from 'blockly';

import { eventEventBlocks } from '../../src/blocks/event/event_event.js';

Blockly.common.defineBlocks(eventEventBlocks);

test('call-service event data block keeps fields while rendering in three rows', () => {
  const workspace = new Blockly.Workspace();
  const block = workspace.newBlock('ha_event_event_data_call_service');

  assert.ok(block.getInput('DOMAIN_ROW'));
  assert.ok(block.getInput('SERVICE_ROW'));
  assert.ok(block.getInput('SERVICE_DATA'));
  assert.ok(block.getField('DOMAIN_MODE'));
  assert.ok(block.getField('DOMAIN'));
  assert.ok(block.getField('DOMAIN_TEXT'));
  assert.ok(block.getField('SERVICE_MODE'));
  assert.ok(block.getField('SERVICE'));
  assert.ok(block.getField('SERVICE_TEXT'));
  assert.ok(block.getField('SERVICE_CALL_ID'));
  assert.equal(block.inputsInline, false);

  block.dispose(false);
  workspace.dispose();
});
