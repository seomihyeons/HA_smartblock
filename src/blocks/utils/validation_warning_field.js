import * as Blockly from 'blockly';

// Blockly 11 WarningIcon uses a 17px coordinate space. Keep that native size
// inside the existing 22px field row so the triangle is vertically centred.
const WARNING_ICON_SIZE = 17;
const FIELD_WIDTH = WARNING_ICON_SIZE;
const FIELD_HEIGHT = 22;
const ICON_OFFSET_Y = (FIELD_HEIGHT - WARNING_ICON_SIZE) / 2;
const WARNING_SHAPE_PATH = 'M2,15Q-1,15 0.5,12L6.5,1.7Q8,-1 9.5,1.7L15.5,12Q17,15 14,15z';
const WARNING_SYMBOL_PATH = 'm7,4.8v3.16l0.27,2.27h1.46l0.27,-2.27v-3.16z';
const WARNING_COLOUR = '#c2413b';
const WARNING_HOVER_COLOUR = '#dc2626';

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
    this.iconGroup_ = null;
    this.triangle_ = null;
    this.symbols_ = [];
    this.tooltipElement_ = null;
    this.onIconPointerEnter_ = () => {
      this.setHovered_(true);
      this.showErrorTooltip_();
    };
    this.onIconPointerMove_ = () => this.positionErrorTooltip_();
    this.onIconPointerLeave_ = () => {
      this.setHovered_(false);
      this.hideErrorTooltip_();
    };
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

    // Keep the native icon path untouched while offering the complete field
    // area as its hover target.
    this.hitArea_ = Blockly.utils.dom.createSvgElement('rect', {
      x: -1,
      y: 0,
      width: WARNING_ICON_SIZE + 2,
      height: FIELD_HEIGHT,
      fill: '#000000',
      'fill-opacity': 0,
      'pointer-events': 'all',
    }, root);
    this.hitArea_.addEventListener('pointerenter', this.onIconPointerEnter_);
    this.hitArea_.addEventListener('pointermove', this.onIconPointerMove_);
    this.hitArea_.addEventListener('pointerleave', this.onIconPointerLeave_);

    this.iconGroup_ = Blockly.utils.dom.createSvgElement('g', {
      transform: `translate(0, ${ICON_OFFSET_Y})`,
      'pointer-events': 'none',
      // Blockly's own icon groups appear at reduced opacity until hovered.
      opacity: 0.6,
    }, root);
    this.triangle_ = Blockly.utils.dom.createSvgElement('path', {
      // Exact Blockly 11 WarningIcon shape and built-in styling classes.
      class: 'blocklyIconShape',
      d: WARNING_SHAPE_PATH,
      'pointer-events': 'none',
    }, this.iconGroup_);
    // Keep Blockly's geometry while overriding only this validation Field's
    // warning colour; global Blockly icon styles remain untouched.
    this.triangle_.style.fill = WARNING_COLOUR;
    this.symbols_ = [
      Blockly.utils.dom.createSvgElement('path', {
        class: 'blocklyIconSymbol',
        d: WARNING_SYMBOL_PATH,
        'pointer-events': 'none',
      }, this.iconGroup_),
      Blockly.utils.dom.createSvgElement('rect', {
        class: 'blocklyIconSymbol',
        x: '7',
        y: '11',
        height: '2',
        width: '2',
        'pointer-events': 'none',
      }, this.iconGroup_),
    ];
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
    // Multiple validation causes share one compact tooltip line rather than
    // expanding the warning bubble vertically.
    const next = String(message || '').replace(/\s*[\r\n]+\s*/g, ' · ').trim();
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

  setHovered_(hovered) {
    // This mirrors Blockly's `.blocklyIconGroup:not(:hover)` treatment while
    // retaining our separate transparent hit area for the immediate tooltip.
    this.iconGroup_?.setAttribute('opacity', hovered ? '1' : '0.6');
    if (this.triangle_) {
      this.triangle_.style.fill = hovered ? WARNING_HOVER_COLOUR : WARNING_COLOUR;
    }
  }

  syncView_() {
    const visible = Boolean(this.message_);
    const root = this.getSvgRoot();
    if (root) {
      root.setAttribute('aria-label', this.message_ || 'No validation warning');
      root.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    if (this.triangle_) this.triangle_.setAttribute('display', visible ? 'block' : 'none');
    this.symbols_.forEach((symbol) => symbol.setAttribute('display', visible ? 'block' : 'none'));
    if (!visible) this.hideErrorTooltip_();
  }
}

/**
 * Shows an inline validation warning only for a block in the editable
 * workspace. Toolbox and Search Flyout instances are temporary previews, so
 * they intentionally remain free of validation UI.
 */
export function updateInlineValidationWarning(block, inputOrName, message) {
  const input = typeof inputOrName === 'string'
    ? block?.getInput?.(inputOrName)
    : inputOrName;
  if (!block || !input) return;

  const nextMessage = block.isInFlyout || block.workspace?.isFlyout
    ? ''
    : String(message || '').trim();
  let field = block.getField('VALIDATION_WARNING');

  if (!nextMessage) {
    // Removing the Field, instead of only hiding it, avoids a leftover
    // between-field separator before the first block label.
    if (field) input.removeField('VALIDATION_WARNING', true);
    return;
  }

  if (!field) {
    field = new ValidationWarningField();
    input.insertFieldAt(0, field, 'VALIDATION_WARNING');
  }
  field.setMessage(nextMessage);
}
