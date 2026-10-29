import * as Blockly from 'blockly';

/**
 * Restores the prior workspace if a renderer/importer throws after it has
 * started clearing or rebuilding the current automation.
 */
export function replaceWorkspaceSafely(workspace, replace) {
  const previousState = Blockly.serialization.workspaces.save(workspace);

  try {
    replace();
  } catch (error) {
    Blockly.Events.disable();
    try {
      workspace.clear();
      Blockly.serialization.workspaces.load(previousState, workspace, false);
    } finally {
      Blockly.Events.enable();
    }
    throw error;
  }
}
