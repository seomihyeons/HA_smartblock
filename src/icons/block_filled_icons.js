import * as Blockly from 'blockly';
import { resolveConfiguredIcon } from './icon_semantics.js';
import { mdiDataUri } from './mdi_svg.js';
import { dummyEntities } from '../data/entities_index.js';

const FIELD_NAME = 'HA_FILLED_ICON';
const WRAPPED = Symbol('haFilledIconWrapped');
const ICON_BLOCK = Symbol('haFilledIconBlock');
const RENDER_WRAPPED = Symbol('haFilledIconRenderWrapped');
const ICON_WIDTH = 18;
const CENTER_TOLERANCE_PX = 0.5;

/**
 * Runs synchronously at the end of Blockly's normal block render, including
 * toolbox flyouts and Block Search flyouts. The icon is correctly positioned
 * before that frame is painted. It never needs to move during dragging.
 *
 * Only the image's y is adjusted; the FieldImage group keeps its original
 * position and layout width, so Blockly connection geometry is unaffected.
 */
function centerFilledIconDuringRender(block) {
  const field = block.getField?.(FIELD_NAME);
  const image = field?.getSvgRoot?.()?.querySelector('image');
  const outline = block.pathObject?.svgPath ||
    block.getSvgRoot?.()?.querySelector('.blocklyPath');
  if (!image || !outline || !image.isConnected || !outline.isConnected) return;
  const iconBounds = image.getBoundingClientRect();
  const blockBounds = outline.getBoundingClientRect();
  if (iconBounds.height <= 0 || blockBounds.height <= 0) return;
  const delta = (blockBounds.top + blockBounds.height / 2) -
    (iconBounds.top + iconBounds.height / 2);
  if (Math.abs(delta) <= CENTER_TOLERANCE_PX) return;
  const scale = Number(block.workspace?.scale) || 1;
  const oldY = Number(image.getAttribute('y') || 0);
  image.setAttribute('y', String(oldY + delta / scale));
}

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
  const field = new Blockly.FieldImage(
    mdiDataUri(icon.name, icon.color), ICON_WIDTH, ICON_WIDTH, '',
  );
  field.SERIALIZABLE = false;
  target.insertFieldAt(0, field, FIELD_NAME);
}

/**
 * Install once on BlockSvg's synchronous render lifecycle. Every new block,
 * whether in the regular workspace or a temporary flyout/search workspace,
 * goes through this same path before it becomes visible.
 */
function installRenderAlignment() {
  const prototype = Blockly.BlockSvg.prototype;
  if (prototype[RENDER_WRAPPED]) return;
  const originalRender = prototype.render;
  prototype.render = function (...args) {
    if (this[ICON_BLOCK]) {
      // Dynamic block shapes may rebuild their first input row.
      insertFilledField(this);
      updateFilled(this);
    }
    const result = originalRender.apply(this, args);
    if (this[ICON_BLOCK]) centerFilledIconDuringRender(this);
    return result;
  };
  prototype[RENDER_WRAPPED] = true;
}

/** Decorates block definitions before Blockly.inject creates flyout workspaces. */
export function decorateBlockDefinitionsWithFilledIcons() {
  installRenderAlignment();
  for (const definition of Object.values(Blockly.Blocks)) {
    if (!definition || typeof definition.init !== 'function' || definition[WRAPPED]) continue;
    const baseInit = definition.init;
    definition.init = function (...args) {
      baseInit.apply(this, args);
      this[ICON_BLOCK] = true;
      insertFilledField(this);
    };
    definition[WRAPPED] = true;
  }
}

/**
 * Main workspace integration only refreshes icon images when fields change.
 * In particular, no BLOCK_MOVE event (and no animation frame callback) reads
 * block geometry. Render-time centering handles toolbox, search and canvas.
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
