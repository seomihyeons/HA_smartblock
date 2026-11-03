import * as Blockly from 'blockly';

const SIZE = 17;
const HEIGHT = 22;
const TRIANGLE = 'M2,15Q-1,15 0.5,12L6.5,1.7Q8,-1 9.5,1.7L15.5,12Q17,15 14,15z';
const SYMBOL = 'm7,4.8v3.16l0.27,2.27h1.46l0.27,-2.27v-3.16z';

// Exact same SVG geometry as Blockly's WarningIcon, embedded in a field row
// so threshold feedback does not change the block's connection layout.
export class ValidationWarningField extends Blockly.FieldLabel {
  constructor() {
    super('', 'ha-validation-warning-text');
    this.message_ = ''; this.symbols_ = []; this.tooltip_ = null; this.hitArea_ = null;
    this.enter_ = () => {
      this.group_?.setAttribute('opacity', '1');
      if (this.triangle_) this.triangle_.style.fill = '#dc2626';
      this.showTooltip_();
    };
    this.move_ = () => this.positionTooltip_();
    this.leave_ = () => {
      this.group_?.setAttribute('opacity', '.6');
      if (this.triangle_) this.triangle_.style.fill = '#c2413b';
      this.hideTooltip_();
    };
    this.setTooltip('');
  }
  isSerializable() { return false; }
  initView() {
    super.initView(); this.getTextElement()?.setAttribute('display', 'none');
    const root = this.getSvgRoot(); if (!root || this.triangle_) return;
    root.style.cursor = 'help';
    this.hitArea_ = Blockly.utils.dom.createSvgElement('rect', { x: -1, y: 0, width: SIZE + 2, height: HEIGHT, fill: '#000', 'fill-opacity': 0, 'pointer-events': 'all' }, root);
    this.hitArea_.addEventListener('pointerenter', this.enter_);
    this.hitArea_.addEventListener('pointermove', this.move_);
    this.hitArea_.addEventListener('pointerleave', this.leave_);
    this.group_ = Blockly.utils.dom.createSvgElement('g', { transform: 'translate(0, 2.5)', 'pointer-events': 'none', opacity: .6 }, root);
    this.triangle_ = Blockly.utils.dom.createSvgElement('path', { class: 'blocklyIconShape', d: TRIANGLE, 'pointer-events': 'none' }, this.group_);
    this.triangle_.style.fill = '#c2413b';
    this.symbols_ = [
      Blockly.utils.dom.createSvgElement('path', { class: 'blocklyIconSymbol', d: SYMBOL, 'pointer-events': 'none' }, this.group_),
      Blockly.utils.dom.createSvgElement('rect', { class: 'blocklyIconSymbol', x: '7', y: '11', height: '2', width: '2', 'pointer-events': 'none' }, this.group_),
    ];
    this.sync_();
  }
  updateSize_() { super.updateSize_(0); this.size_.width = this.message_ ? SIZE : 0; this.size_.height = this.message_ ? HEIGHT : 0; this.getTextElement()?.setAttribute('display', 'none'); this.sync_(); }
  setMessage(message) {
    const next = String(message || '').replace(/\s*[\r\n]+\s*/g, ' · ').trim(); if (next === this.message_) return;
    this.message_ = next;
    if (this.tooltip_ && !this.tooltip_.hidden) {
      this.tooltip_.textContent = next;
      this.positionTooltip_();
    }
    this.setVisible(Boolean(next)); this.markDirty(); this.forceRerender(); this.sync_();
  }
  showTooltip_() {
    if (!this.message_ || !this.triangle_) return;
    if (!this.tooltip_) { this.tooltip_ = document.createElement('div'); this.tooltip_.className = 'ha-validation-warning-tooltip'; this.tooltip_.setAttribute('role', 'tooltip'); document.body.appendChild(this.tooltip_); }
    this.tooltip_.textContent = this.message_; this.tooltip_.hidden = false; this.positionTooltip_();
  }
  positionTooltip_() {
    if (!this.tooltip_ || this.tooltip_.hidden || !this.triangle_) return;
    const rect = this.triangle_.getBoundingClientRect();
    this.tooltip_.style.left = `${rect.left + rect.width / 2}px`;
    this.tooltip_.style.top = `${rect.top - 8}px`;
  }
  hideTooltip_() { if (this.tooltip_) this.tooltip_.hidden = true; }
  dispose() {
    this.hitArea_?.removeEventListener('pointerenter', this.enter_);
    this.hitArea_?.removeEventListener('pointermove', this.move_);
    this.hitArea_?.removeEventListener('pointerleave', this.leave_);
    this.hideTooltip_(); super.dispose();
  }
  sync_() {
    const visible = Boolean(this.message_);
    const root = this.getSvgRoot();
    root?.setAttribute('aria-label', this.message_ || 'No validation warning');
    root?.setAttribute('aria-hidden', visible ? 'false' : 'true');
    this.triangle_?.setAttribute('display', visible ? 'block' : 'none');
    this.symbols_.forEach((node) => node.setAttribute('display', visible ? 'block' : 'none'));
    if (!visible) this.hideTooltip_();
  }
}

export function updateInlineValidationWarning(block, inputOrName, message) {
  const input = typeof inputOrName === 'string' ? block?.getInput?.(inputOrName) : inputOrName;
  if (!block || !input) return;
  const next = block.isInFlyout || block.workspace?.isFlyout ? '' : String(message || '').trim();
  let field = block.getField('VALIDATION_WARNING');
  if (!next) { if (field) input.removeField('VALIDATION_WARNING', true); return; }
  if (!field) { field = new ValidationWarningField(); input.insertFieldAt(0, field, 'VALIDATION_WARNING'); }
  field.setMessage(next);
}
