import * as Blockly from 'blockly';

// Importers are allowed to rebuild the workspace, but never to leave it empty
// if conversion or rendering throws partway through.
export function replaceWorkspaceSafely(workspace, replace) {
  const previousState = Blockly.serialization.workspaces.save(workspace);
  try {
    return replace();
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
