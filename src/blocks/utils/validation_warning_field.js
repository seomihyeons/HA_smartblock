import * as Blockly from 'blockly';

// The 11px icon gets only a minimal own hit-area; Blockly's normal
// between-field separator supplies the remaining gap before the label.
const FIELD_WIDTH = 12;
const FIELD_HEIGHT = 22;

/**
 * A non-serializable warning indicator embedded in a Blockly input row.
 * The icon uses an immediate, warning-specific tooltip so validation feedback
 * does not wait for Blockly's global help-tooltip delay.
 */
export class ValidationWarningField extends Blockly.FieldLabel {
  constructor() {
    super('', 'ha-validation-warning-text');
    this.message_ = '';
    this.hitArea_ = null;
    this.triangle_ = null;
    this.symbol_ = null;
    this.tooltipElement_ = null;
    this.onIconPointerEnter_ = () => this.showErrorTooltip_();
    this.onIconPointerMove_ = () => this.positionErrorTooltip_();
    this.onIconPointerLeave_ = () => this.hideErrorTooltip_();
    // Prevent the generic block tooltip from appearing after the custom
    // validation tooltip has already been shown.
    this.setTooltip('');
  }

  isSerializable() {
    return false;
  }

  initView() {
    super.initView();
    this.getTextElement()?.setAttribute('display', 'none');

    const root = this.getSvgRoot();
    if (!root || this.triangle_) return;
    root.style.cursor = 'help';

    // Keep the visible icon compact, but give it a forgiving hover target.
    // It reaches only into the normal field gap, not across the block label.
    this.hitArea_ = Blockly.utils.dom.createSvgElement('rect', {
      x: -2,
      y: 1,
      width: 20,
      height: 20,
      fill: '#000000',
      'fill-opacity': 0,
      'pointer-events': 'all',
    }, root);
    this.hitArea_.addEventListener('pointerenter', this.onIconPointerEnter_);
    this.hitArea_.addEventListener('pointermove', this.onIconPointerMove_);
    this.hitArea_.addEventListener('pointerleave', this.onIconPointerLeave_);

    this.triangle_ = Blockly.utils.dom.createSvgElement('circle', {
      cx: 9,
      cy: 11,
      // 20% smaller than the previous 14px outline icon.
      r: 5.6,
      fill: 'none',
      stroke: '#8B4B27',
      'stroke-width': 1.7,
      'pointer-events': 'none',
    }, root);
    this.triangle_.addEventListener('pointerenter', this.onIconPointerEnter_);
    this.triangle_.addEventListener('pointermove', this.onIconPointerMove_);
    this.triangle_.addEventListener('pointerleave', this.onIconPointerLeave_);
    this.symbol_ = Blockly.utils.dom.createSvgElement('path', {
      // Lucide circle-alert's alert mark, expressed in the compact Field.
      d: 'M 9 7.8 V 10.6 M 9 13.2 h 0.01',
      fill: 'none',
      stroke: '#8B4B27',
      'stroke-width': 1.35,
      'stroke-linecap': 'round',
      'pointer-events': 'none',
    }, root);
    this.syncView_();
  }

  updateSize_() {
    super.updateSize_(0);
    const visible = Boolean(this.message_);
    this.size_.width = visible ? FIELD_WIDTH : 0;
    this.size_.height = visible ? FIELD_HEIGHT : 0;
    this.getTextElement()?.setAttribute('display', 'none');
    this.syncView_();
  }

  setMessage(message) {
    const next = String(message || '').trim();
    if (next === this.message_) return;
    this.message_ = next;
    if (this.tooltipElement_ && !this.tooltipElement_.hidden) {
      this.tooltipElement_.textContent = next;
      this.positionErrorTooltip_();
    }
    this.setVisible(Boolean(next));
    // Visibility changes do not automatically invalidate Blockly's cached row
    // measurements. Marking this Field dirty guarantees no empty spacer is
    // left before "numeric state" after a warning is resolved.
    this.markDirty();
    this.forceRerender();
    this.syncView_();
  }

  dispose() {
    if (this.hitArea_) {
      this.hitArea_.removeEventListener('pointerenter', this.onIconPointerEnter_);
      this.hitArea_.removeEventListener('pointermove', this.onIconPointerMove_);
      this.hitArea_.removeEventListener('pointerleave', this.onIconPointerLeave_);
    }
    this.hideErrorTooltip_();
    super.dispose();
  }

  showErrorTooltip_() {
    if (!this.message_ || !this.triangle_) return;
    if (!this.tooltipElement_) {
      this.tooltipElement_ = document.createElement('div');
      this.tooltipElement_.className = 'ha-validation-warning-tooltip';
      this.tooltipElement_.setAttribute('role', 'tooltip');
      document.body.appendChild(this.tooltipElement_);
    }
    this.tooltipElement_.textContent = this.message_;
    this.tooltipElement_.hidden = false;
    this.positionErrorTooltip_();
  }

  positionErrorTooltip_() {
    if (!this.tooltipElement_ || this.tooltipElement_.hidden || !this.triangle_) return;
    const rect = this.triangle_.getBoundingClientRect();
    this.tooltipElement_.style.left = `${rect.left + rect.width / 2}px`;
    this.tooltipElement_.style.top = `${rect.top - 8}px`;
  }

  hideErrorTooltip_() {
    if (!this.tooltipElement_) return;
    this.tooltipElement_.hidden = true;
  }

  syncView_() {
    const visible = Boolean(this.message_);
    const root = this.getSvgRoot();
    if (root) {
      root.setAttribute('aria-label', this.message_ || 'No validation warning');
      root.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    if (this.triangle_) this.triangle_.setAttribute('display', visible ? 'block' : 'none');
    if (this.symbol_) this.symbol_.setAttribute('display', visible ? 'block' : 'none');
    if (!visible) this.hideErrorTooltip_();
  }
}
