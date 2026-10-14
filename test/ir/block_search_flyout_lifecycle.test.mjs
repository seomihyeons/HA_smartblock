import assert from 'node:assert/strict';
import test from 'node:test';
import * as Blockly from 'blockly';

import {
  closeNativeToolboxFlyout,
  isToolboxCategorySelection,
} from '../../src/block_search_flyout.js';

test('opening Block Search clears and hides the native Toolbox flyout', () => {
  let clearCount = 0;
  let hideCount = 0;
  const workspace = {
    getToolbox() {
      return {
        clearSelection() { clearCount += 1; },
        getFlyout() {
          return { hide() { hideCount += 1; } };
        },
      };
    },
  };

  closeNativeToolboxFlyout(workspace);

  assert.equal(clearCount, 1);
  assert.equal(hideCount, 1);
});

test('only a newly selected Toolbox category closes Block Search', () => {
  assert.equal(
    isToolboxCategorySelection({ type: Blockly.Events.TOOLBOX_ITEM_SELECT, newItem: 'condition' }),
    true
  );
  assert.equal(
    isToolboxCategorySelection({ type: Blockly.Events.TOOLBOX_ITEM_SELECT, newItem: null }),
    false
  );
  assert.equal(isToolboxCategorySelection({ type: Blockly.Events.BLOCK_CHANGE, newItem: 'condition' }), false);
});

