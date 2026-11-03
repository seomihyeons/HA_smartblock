import * as Blockly from 'blockly';
import { resolveConfiguredIcon } from './icon_semantics.js';
import { mdiDataUri } from './mdi_svg.js';
import { dummyEntities } from '../data/entities_index.js';

const FIELD_NAME='HA_FILLED_ICON';
const WRAPPED=Symbol('haFilledIconWrapped');
const TRACKED_FIELDS=new Set(['TO','STATE','STATE_KIND','ACTION','SERVICE','EVENT','ENTITY','ENTITY_ID','USER','DOMAIN']);
const ICON_WIDTH=18;
const CENTER_TOLERANCE_PX=0.5;

/**
 * Blockly positions image fields in an input row. For compact blocks that
 * alignment can sit above the visual center of the complete block outline.
 * Translate ONLY the SVG image (not Blockly's field group/connection geometry).
 * Reading DOM bounds allows zoom and differing row heights to be respected.
 */
function centerFilledIcon(block) {
  const field=block?.getField?.(FIELD_NAME);
  const image=field?.getSvgRoot?.()?.querySelector('image');
  const outline=block?.pathObject?.svgPath || block?.getSvgRoot?.()?.querySelector('.blocklyPath');
  if (!image || !outline || !image.isConnected || !outline.isConnected) return;
  const iconBounds=image.getBoundingClientRect();
  const blockBounds=outline.getBoundingClientRect();
  if (iconBounds.height<=0 || blockBounds.height<=0) return;
  const delta=(blockBounds.top+blockBounds.height/2)-(iconBounds.top+iconBounds.height/2);
  if (Math.abs(delta)<=CENTER_TOLERANCE_PX) return;
  const scale=Number(block.workspace?.scale)||1;
  const oldY=Number(image.getAttribute('y')||0);
  image.setAttribute('y',String(oldY+delta/scale));
}

function selectedEntity(block) {
  const id=block.getFieldValue?.('ENTITY_ID') || block.getFieldValue?.('ENTITY') || '';
  return (dummyEntities || []).find(e=>e.entity_id===id) || null;
}

function updateFilled(block) {
  const field=block?.getField?.(FIELD_NAME);
  if (!field) return;
  const icon=resolveConfiguredIcon(block,selectedEntity(block));
  if (!icon) return;
  const next=mdiDataUri(icon.name,icon.color);
  if (field.getValue()===next) return;
  // MDI is presentation-only; never record a semantic Blockly change.
  const wasEnabled=Blockly.Events.isEnabled();
  if (wasEnabled) Blockly.Events.disable();
  try { field.setValue(next); } finally { if (wasEnabled) Blockly.Events.enable(); }
}

function insertFilledField(block) {
  if (block.getField?.(FIELD_NAME) || !(block.workspace instanceof Blockly.WorkspaceSvg)) return;
  const icon=resolveConfiguredIcon(block,selectedEntity(block));
  if (!icon) return;
  // Input geometry and connections are left unchanged. FieldImage is not serialized.
  const target=block.inputList.find(input=>input.fieldRow?.length && input.isVisible?.()!==false);
  if (!target) return;
  const field=new Blockly.FieldImage(mdiDataUri(icon.name,icon.color),ICON_WIDTH,ICON_WIDTH,'');
  field.SERIALIZABLE=false;
  target.insertFieldAt(0,field,FIELD_NAME);
}

/** Decorates each block definition, including toolbox flyout and Search clones. */
export function decorateBlockDefinitionsWithFilledIcons() {
  for (const definition of Object.values(Blockly.Blocks)) {
    if (!definition || typeof definition.init!=='function' || definition[WRAPPED]) continue;
    const baseInit=definition.init;
    definition.init=function(...args) {
      baseInit.apply(this,args);
      insertFilledField(this);
    };
    definition[WRAPPED]=true;
  }
}

/** Watches configured values without replacing any existing field validator. */
export function installFilledIconsOnWorkspace(workspace) {
  const waiting=new Set();
  let frame=null;
  const scheduleCenter=(block)=>{
    if (!block || block.isDisposed?.()) return;
    waiting.add(block.id);
    if (frame!==null) return;
    frame=requestAnimationFrame(()=>{
      frame=null;
      for (const id of waiting) centerFilledIcon(workspace.getBlockById(id));
      waiting.clear();
    });
  };
  const refresh=(id)=>{
    const block=workspace.getBlockById(id);
    if (!block) return;
    if (!block.getField(FIELD_NAME)) insertFilledField(block);
    updateFilled(block);
    scheduleCenter(block);
  };
  for (const block of workspace.getAllBlocks(false)) refresh(block.id);
  workspace.addChangeListener((event)=>{
    if (event.type===Blockly.Events.BLOCK_CREATE || event.type===Blockly.Events.FINISHED_LOADING) {
      queueMicrotask(()=>{
        if (event.type===Blockly.Events.BLOCK_CREATE && event.ids?.length) event.ids.forEach(refresh);
        else workspace.getAllBlocks(false).forEach(b=>refresh(b.id));
      });
    } else if (event.type===Blockly.Events.BLOCK_CHANGE && TRACKED_FIELDS.has(event.name)) {
      queueMicrotask(()=>refresh(event.blockId));
    } else if (event.type===Blockly.Events.BLOCK_MOVE) {
      queueMicrotask(()=>workspace.getAllBlocks(false).forEach(scheduleCenter));
    }
  });
}
