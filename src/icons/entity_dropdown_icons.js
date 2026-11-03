import * as Blockly from 'blockly';
import { resolveActualIcon, resolveSunDropdownIcon } from './icon_semantics.js';
import { mdiDataUri } from './mdi_svg.js';

const ENHANCED=Symbol('haActualIcon');
const ENTITY_NAMES=['ENTITY_ID','ENTITY','AFTER_ENTITY','BEFORE_ENTITY','USER'];
const SIZE=16;
// 16px glyph at x=7 ends at 23; 28px indentation leaves ~5px (one space).
const SPACE=28;
let stateStore=null;

export function setEntityIconStateStore(store) { stateStore=store; }

function iconFor(field) {
  const block=field.getSourceBlock?.();
  const sun=resolveSunDropdownIcon(block?.type,field.name,String(field.getValue?.()||''));
  if(sun) return sun;
  const id=String(field.getValue?.()||'');
  return resolveActualIcon(id,stateStore?.get(id)||null);
}

function isSunDropdown(field) {
  return !!resolveSunDropdownIcon(field.getSourceBlock?.()?.type,field.name,field.getValue?.());
}

function shiftSvgArrow(field) {
  const arrow=field.svgArrow || field.svgArrow_;
  const t=arrow?.getAttribute('transform')||'';
  const m=t.match(/^translate\(([\d.+-]+),\s*([\d.+-]+)\)$/);
  if(m) arrow.setAttribute('transform',`translate(${Number(m[1])+SPACE},${m[2]})`);
}

/** Add an MDI image INSIDE the original FieldDropdown's SVG group.
 * Never replace the original dropdown instance, options or validators. */
export function enhanceEntityDropdownIcon(field) {
  if(!(field instanceof Blockly.FieldDropdown) || field[ENHANCED]) return;
  field[ENHANCED]=true;
  const baseRender=field.render_.bind(field);
  let iconImage=null;
  field.render_=function renderWithActualIcon() {
    baseRender();
    const root=this.getSvgRoot?.();
    if(!root || !this.size_) return;
    if(!iconImage) {
      iconImage=document.createElementNS('http://www.w3.org/2000/svg','image');
      iconImage.setAttribute('width',String(SIZE));
      iconImage.setAttribute('height',String(SIZE));
      iconImage.setAttribute('pointer-events','none');
      iconImage.setAttribute('aria-hidden','true');
      iconImage.setAttribute('data-ha-actual-icon','true');
      root.appendChild(iconImage);
    }
    const current=iconFor(this);
    iconImage.setAttribute('href',mdiDataUri(current.name,current.color));
    const height=this.size_.height;
    const x=this.getSourceBlock()?.RTL ? Math.max(0,this.size_.width-SPACE-4) : 7;
    iconImage.setAttribute('x',String(x));
    iconImage.setAttribute('y',String((height-SIZE)/2));
    this.textElement_?.setAttribute('transform',this.getSourceBlock()?.RTL?`translate(-${SPACE},0)`:`translate(${SPACE},0)`);
    if(!this.getSourceBlock()?.RTL) shiftSvgArrow(this);
    this.size_.width+=SPACE;
    this.borderRect_?.setAttribute('width',String(this.size_.width));
  };
  if(field.getSvgRoot?.()) field.forceRerender?.();
}

export function refreshEntityIcon(field) {
  if(!field?.[ENHANCED]) return;
  const root=field.getSvgRoot?.();
  // Refreshing an icon must not trigger block change events, YAML generation or Undo.
  const image=root?.querySelector('image[data-ha-actual-icon="true"]');
  if(image) {
    const icon=iconFor(field);
    image.setAttribute('href',mdiDataUri(icon.name,icon.color));
  }
}

export function enhanceBlockEntityIcons(block) {
  if(!block?.getField) return;
  ENTITY_NAMES.forEach(name=>enhanceEntityDropdownIcon(block.getField(name)));
  // Sun events and phases are dropdowns, not HA entity IDs. Their icons
  // represent the selected sunrise/sunset/day/night value, even in flyouts.
  for(const name of ['EVENT','PHASE','FROM','TO']) {
    const field=block.getField(name);
    if(field && isSunDropdown(field)) enhanceEntityDropdownIcon(field);
  }
}

/** One shared subscription, only update fields whose actual HA states changed. */
export function installLiveEntityIcons(workspace,store) {
  setEntityIconStateStore(store);
  const update=(changed)=> {
    for(const block of workspace.getAllBlocks(false)) {
      for(const name of ENTITY_NAMES) {
        const field=block.getField(name);
        if(!field) continue;
        if(changed && !changed.has(String(field.getValue?.()||''))) continue;
        refreshEntityIcon(field);
      }
    }
  };
  const unsubscribe=store.subscribe(update);
  return ()=>unsubscribe();
}
