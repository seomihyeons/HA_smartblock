import assert from 'node:assert/strict';
import test from 'node:test';
import * as Blockly from 'blockly';

import {
  createWorkspaceDirtyTracker,
  DISCARD_CHANGES_MESSAGE,
} from '../../src/utils/workspace_dirty_tracker.js';
import { replaceWorkspaceSafely } from '../../src/utils/safe_workspace_replace.js';

Blockly.common.defineBlocks(Blockly.common.createBlockDefinitionsFromJsonArray([
  {
    type: 'workspace_dirty_tracker_test',
    message0: 'value %1',
    args0: [{ type: 'field_input', name: 'VALUE', text: 'initial' }],
  },
]));

function addTestBlock(workspace, value = 'initial') {
  const block = workspace.newBlock('workspace_dirty_tracker_test');
  block.setFieldValue(value, 'VALUE');
  return block;
}

test('tracks semantic changes and becomes clean again when undo-equivalent state is restored', () => {
  const workspace = new Blockly.Workspace();
  const tracker = createWorkspaceDirtyTracker(workspace);
  assert.equal(tracker.hasUnsavedChanges(), false);

  const block = addTestBlock(workspace);
  tracker.markClean();
  block.setFieldValue('changed', 'VALUE');
  assert.equal(tracker.hasUnsavedChanges(), true);

  block.setFieldValue('initial', 'VALUE');
  assert.equal(tracker.hasUnsavedChanges(), false);

  block.moveBy(100, 50);
  assert.equal(tracker.hasUnsavedChanges(), false, 'layout-only moves do not change automation content');

  workspace.clear();
  assert.equal(tracker.hasUnsavedChanges(), true, 'deleting a loaded automation is a semantic change');
  workspace.dispose();
});

test('confirms only when the workspace is dirty and uses the required message', async () => {
  const workspace = new Blockly.Workspace();
  const tracker = createWorkspaceDirtyTracker(workspace);
  let calls = 0;

  assert.equal(await tracker.confirmBeforeReplace(() => { calls += 1; return false; }), true);
  assert.equal(calls, 0);

  addTestBlock(workspace);
  assert.equal(await tracker.confirmBeforeReplace((message) => {
    calls += 1;
    assert.equal(message, DISCARD_CHANGES_MESSAGE);
    return false;
  }), false);
  assert.equal(calls, 1);
  workspace.dispose();
});

test('restores the prior workspace when replacement throws after clearing it', () => {
  const workspace = new Blockly.Workspace();
  const original = addTestBlock(workspace, 'keep me');

  assert.throws(() => replaceWorkspaceSafely(workspace, () => {
    workspace.clear();
    addTestBlock(workspace, 'partial replacement');
    throw new Error('import failed');
  }), /import failed/);

  const restored = workspace.getBlockById(original.id);
  assert.equal(restored?.getFieldValue('VALUE'), 'keep me');
  workspace.dispose();
});
