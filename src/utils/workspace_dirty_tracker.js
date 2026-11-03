import * as Blockly from 'blockly';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    // Moving a top-level block is not a semantic automation edit.
    if (key !== 'x' && key !== 'y') result[key] = canonicalize(value[key]);
    return result;
  }, {});
}

function snapshot(workspace) {
  return JSON.stringify(canonicalize(Blockly.serialization.workspaces.save(workspace)));
}

export function createWorkspaceDirtyTracker(workspace) {
  let cleanSnapshot = snapshot(workspace);
  return {
    hasUnsavedChanges: () => snapshot(workspace) !== cleanSnapshot,
    markClean: () => { cleanSnapshot = snapshot(workspace); },
    async confirmBeforeReplace(confirmFn) {
      return !this.hasUnsavedChanges() || (typeof confirmFn === 'function' && await confirmFn());
    },
  };
}
