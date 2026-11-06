import * as Blockly from 'blockly';
import { resolveConfiguredIcon } from './icon_semantics.js';
import { mdiDataUri } from './mdi_svg.js';
import { enhanceBlockEntityIcons } from './entity_dropdown_icons.js';
import { dummyEntities } from '../data/entities_index.js';
import { HaLeadingIconField } from './ha_leading_icon_field.js';

const FIELD_NAME = 'HA_FILLED_ICON';
const WRAPPED = Symbol('haFilledIconWrapped');

function selectedEntity(block) {
  const id = block.getFieldValue?.('ENTITY_ID') ||
    block.getFieldValue?.('ENTITY') || '';
  return (dummyEntities || []).find((e) => e.entity_id === id) || null;
}
function updateFilled(block) {
  const field = block?.getField?.(FIELD_NAME);
  if (!field) return;
  const icon = resolveConfiguredIcon(block, selectedEntity(block));
  if (!icon) {
    const existing = block.inputList.find((input) => input.fieldRow?.includes(field));
    existing?.removeField(FIELD_NAME, true);
    return;
  }
  const next = mdiDataUri(icon.name, icon.color);
  if (field.getValue() === next) return;
  // Leading icons are presentation only; keep them out of YAML and undo.
  const wasEnabled = Blockly.Events.isEnabled();
  if (wasEnabled) Blockly.Events.disable();
  try {
    field.setValue(next);
  } finally {
    if (wasEnabled) Blockly.Events.enable();
  }
}

function insertFilledField(block) {
  if (block.getField?.(FIELD_NAME) ||
    !(block.workspace instanceof Blockly.WorkspaceSvg)) return;
  const icon = resolveConfiguredIcon(block, selectedEntity(block));
  if (!icon) return;
  const target = block.inputList.find(
    (input) => input.fieldRow?.length && input.isVisible?.() !== false,
  );
  if (!target) return;
  const field = new HaLeadingIconField(mdiDataUri(icon.name, icon.color));
  target.insertFieldAt(0, field, FIELD_NAME);
}

/** Decorates block definitions before Blockly.inject creates flyout workspaces. */
export function decorateBlockDefinitionsWithFilledIcons() {
  for (const definition of Object.values(Blockly.Blocks)) {
    if (!definition || typeof definition.init !== 'function' || definition[WRAPPED]) continue;
    const baseInit = definition.init;
    definition.init = function (...args) {
      baseInit.apply(this, args);
      // Install on the block definition itself, not on the editing workspace.
      // Temporary native Toolbox and Block Search clones then get identical
      // live-state Entity dropdown icons during their first SVG render.
      enhanceBlockEntityIcons(this);
      insertFilledField(this);
    };
    definition[WRAPPED] = true;
  }
}

/**
 * Main workspace integration only refreshes icon images when fields change.
 * Field layout is owned by Blockly and is identical for toolbox, search and
 * editing workspaces; no render-time geometry adjustment is required.
 */
export function installFilledIconsOnWorkspace(workspace) {
  const refresh = (id) => {
    const block = workspace.getBlockById(id);
    if (!block) return;
    insertFilledField(block);
    updateFilled(block);
  };
  for (const block of workspace.getAllBlocks(false)) refresh(block.id);
  workspace.addChangeListener((event) => {
    if (event.type === Blockly.Events.BLOCK_CREATE ||
        event.type === Blockly.Events.FINISHED_LOADING) {
      queueMicrotask(() => {
        if (event.type === Blockly.Events.BLOCK_CREATE && event.ids?.length) {
          event.ids.forEach(refresh);
        } else {
          for (const block of workspace.getAllBlocks(false)) refresh(block.id);
        }
      });
    } else if (event.type === Blockly.Events.BLOCK_CHANGE) {
      queueMicrotask(() => refresh(event.blockId));
    }
  });
}
