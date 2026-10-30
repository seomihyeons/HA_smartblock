/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Blockly from 'blockly/core';

const storageKey = 'customGeneratorWorkspace';

function blockDepth(block) {
  let depth = 0;
  let parent = block?.getParent?.();
  while (parent) {
    depth += 1;
    parent = parent.getParent?.();
  }
  return depth;
}

/**
 * Serialization restores Blockly's model synchronously, but custom blocks
 * that rebuild inputs from extra state can finish with stale SVG measurements.
 * Refresh only the view after a successful restore; this does not alter the
 * workspace model or its persisted JSON.
 */
function refreshRestoredWorkspaceSvg(workspace) {
  if (!workspace?.getParentSvg?.()) return;

  const blocks = (workspace.getAllBlocks?.(false) || [])
    .filter((block) => block?.rendered && typeof block.render === 'function')
    .sort((a, b) => blockDepth(a) - blockDepth(b));

  blocks.forEach((block) => {
    try {
      block.render();
    } catch (error) {
      // A view refresh must never discard restored data or prevent other
      // blocks from rendering.
      console.warn('[serialization] SVG refresh failed for block:', block.type, block.id, error);
    }
  });

  try {
    Blockly.svgResize(workspace);
  } catch (error) {
    console.warn('[serialization] SVG resize after restore failed:', error);
  }
}

function scheduleRestoredWorkspaceSvgRefresh(workspace) {
  const refresh = () => refreshRestoredWorkspaceSvg(workspace);
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(refresh);
  } else {
    refresh();
  }
}

/**
 * Saves the state of the workspace to browser's local storage.
 * @param {Blockly.Workspace} workspace Blockly workspace to save.
 */
export const save = function (workspace) {
  const data = Blockly.serialization.workspaces.save(workspace);
  window.localStorage?.setItem(storageKey, JSON.stringify(data));
};

/**
 * Loads saved state from local storage into the given workspace.
 * @param {Blockly.Workspace} workspace Blockly workspace to load into.
 */
export const load = function (workspace) {
  const data = window.localStorage?.getItem(storageKey);
  if (!data) return;

  let restored = false;
  // Don't emit events during loading.
  Blockly.Events.disable();
  try {
    Blockly.serialization.workspaces.load(JSON.parse(data), workspace, false);
    restored = true;
  } catch (err) {
    // 블록 정의 변경(입력 소켓 제거 등)으로 기존 저장 데이터가 호환되지 않을 수 있다.
    // 이 경우 저장 데이터를 지우고 빈 워크스페이스로 시작한다.
    console.warn('[serialization] load failed, clearing incompatible workspace state:', err);
    window.localStorage?.removeItem(storageKey);
  } finally {
    Blockly.Events.enable();
  }

  if (restored) scheduleRestoredWorkspaceSvgRefresh(workspace);
};
