import * as Blockly from 'blockly';

export const DISCARD_CHANGES_MESSAGE =
  'You have unsaved changes. Loading another automation will discard them. Do you want to continue?';

function canonicalizeWorkspaceState(value) {
  if (Array.isArray(value)) return value.map(canonicalizeWorkspaceState);
  if (!value || typeof value !== 'object') return value;

  const normalized = {};
  for (const key of Object.keys(value).sort()) {
    // Blockly records top-level block coordinates in serialization. Rearranging
    // a block does not alter the automation, so it must not trigger a discard
    // warning. Connections, fields, mutations, and nested blocks remain.
    if (key === 'x' || key === 'y') continue;
    normalized[key] = canonicalizeWorkspaceState(value[key]);
  }
  return normalized;
}

function workspaceSnapshot(workspace) {
  return JSON.stringify(canonicalizeWorkspaceState(
    Blockly.serialization.workspaces.save(workspace)
  ));
}

/**
 * Tracks semantic Blockly state separately from the existing browser
 * localStorage recovery. The initial baseline is intentionally the empty
 * workspace: a restored local workspace has not been confirmed as saved to
 * Home Assistant and therefore remains dirty until Import, Pull, or Push
 * succeeds.
 */
export function createWorkspaceDirtyTracker(workspace) {
  let cleanSnapshot = workspaceSnapshot(workspace);

  return {
    hasUnsavedChanges() {
      return workspaceSnapshot(workspace) !== cleanSnapshot;
    },

    markClean() {
      cleanSnapshot = workspaceSnapshot(workspace);
    },

    async confirmBeforeReplace(confirmFn) {
      if (!this.hasUnsavedChanges()) return true;
      if (typeof confirmFn !== 'function') return false;
      return (await confirmFn(DISCARD_CHANGES_MESSAGE)) === true;
    },
  };
}
