// src/blocks/condition/condition_numeric_state_entity.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';
import { updateInlineValidationWarning } from '../utils/validation_warning_field.js';

const THRESHOLD_MODES = ['ABOVE', 'BELOW', 'BETWEEN'];
const MODE_SEGMENTS = [
  // Keep enough horizontal room for Blockly's normal 11pt field text and
  // breathing space on both sides of each label.
  { mode: 'ABOVE', label: 'Above', width: 58 },
  { mode: 'BELOW', label: 'Below', width: 56 },
  { mode: 'BETWEEN', label: 'Between', width: 74 },
];
const MODE_CONTROL_HEIGHT = 22;
const MODE_CONTROL_PADDING_X = 2;
const MODE_CONTROL_WIDTH = MODE_SEGMENTS.reduce((total, segment) => total + segment.width, 0) + MODE_CONTROL_PADDING_X * 2;

function getNumericEntities() {
  const options = dummyEntities
    .filter((e) => {
      const v = parseFloat(e.state);
      return !isNaN(v);
    })
    .map((e) => [e.attributes?.friendly_name || e.entity_id, e.entity_id]);

  // Blockly rejects an empty option array during FieldDropdown construction.
  // Runtime Home Assistant data may temporarily have no numeric states (for
  // example while a sensor is unavailable), so keep the toolbox/flyout usable.
  return options.length ? options : [['(No numeric entities)', '']];
}

function createNumericEntityField() {
  let field;
  field = new Blockly.FieldDropdown(getNumericEntities, (entityId) => {
    // A dropdown validator runs before Blockly commits the new value. Pass the
    // candidate through so the unit changes immediately, rather than waiting
    // for a later workspace event.
    field.getSourceBlock()?.updateShape_?.(entityId);
    return entityId;
  });
  return field;
}

function getThresholdMode(block) {
  const useAbove = block?.getFieldValue('USE_ABOVE') === 'TRUE';
  const useBelow = block?.getFieldValue('USE_BELOW') === 'TRUE';
  if (useAbove && useBelow) return 'BETWEEN';
  if (useAbove) return 'ABOVE';
  if (useBelow) return 'BELOW';
  return 'NONE';
}

function getEntityUnit(entityId) {
  const unit = dummyEntities
    .find((entity) => entity?.entity_id === entityId)
    ?.attributes?.unit_of_measurement;
  return typeof unit === 'string' ? unit.trim() : '';
}

class VisualThresholdField extends Blockly.FieldNumber {
  // The legacy ABOVE/BELOW fields are the single serialized source of truth.
  // These fields only render that state in the currently selected layout.
  isSerializable() {
    return false;
  }
}

function createVisualThresholdField(role) {
  let field;
  field = new VisualThresholdField(0, null, null, null, (value) => {
    const block = field.getSourceBlock();
    if (!block || block.isSyncingThresholdVisuals_) return value;

    const mode = getThresholdMode(block);
    const legacyField = role === 'PRIMARY'
      ? (mode === 'BELOW' ? 'BELOW' : 'ABOVE')
      : 'BELOW';
    if (mode === 'NONE' || (role === 'SECONDARY' && mode !== 'BETWEEN')) return value;

    // The displayed number fields are deliberately unnamed, so they are not
    // persisted independently of the legacy ABOVE/BELOW fields.
    block.isEditingVisualThreshold_ = true;
    try {
      block.setFieldValue(value, legacyField);
    } finally {
      block.isEditingVisualThreshold_ = false;
    }
    return value;
  });
  return field;
}

/**
 * Keeps the legacy checkbox fields as the source of truth. This preserves
 * existing YAML imports and serialized workspaces while presenting one choice
 * at a time in the UI.
 */
export function setNumericStateEntityMode(block, mode) {
  if (!block || !THRESHOLD_MODES.includes(mode)) return;

  const useAbove = mode === 'ABOVE' || mode === 'BETWEEN';
  const useBelow = mode === 'BELOW' || mode === 'BETWEEN';
  if (
    block.getFieldValue('USE_ABOVE') === (useAbove ? 'TRUE' : 'FALSE')
    && block.getFieldValue('USE_BELOW') === (useBelow ? 'TRUE' : 'FALSE')
  ) return;

  // A single selection changes two legacy checkbox fields. Suppress the
  // intermediate shape renders and emit one grouped, undoable update instead.
  const existingEventGroup = Blockly.Events.getGroup();
  if (!existingEventGroup) Blockly.Events.setGroup(true);
  block.isUpdatingThresholdMode_ = true;
  try {
    block.setFieldValue(useAbove ? 'TRUE' : 'FALSE', 'USE_ABOVE');
    block.setFieldValue(useBelow ? 'TRUE' : 'FALSE', 'USE_BELOW');
  } finally {
    block.isUpdatingThresholdMode_ = false;
    if (!existingEventGroup) Blockly.Events.setGroup(false);
  }
  block.updateShape_?.();
}

/**
 * A compact, always-visible three-option selector. It stores no new state:
 * selection is derived from the legacy USE_ABOVE/USE_BELOW fields so older
 * localStorage data remains fully compatible.
 */
class NumericThresholdModeField extends Blockly.FieldLabel {
  constructor() {
    super('', 'ha-numeric-threshold-mode-text');
    this.segmentRects_ = [];
    this.segmentTexts_ = [];
  }

  isClickable() {
    return true;
  }

  isClickableInFlyout() {
    return false;
  }

  initView() {
    super.initView();
    this.getTextElement()?.setAttribute('display', 'none');

    const root = this.getSvgRoot();
    if (!root || this.segmentRects_.length) return;

    root.setAttribute('role', 'button');
    root.setAttribute('tabindex', '0');
    root.style.cursor = 'pointer';

    const container = Blockly.utils.dom.createSvgElement('rect', {
      x: 0,
      y: 0,
      width: MODE_CONTROL_WIDTH,
      height: MODE_CONTROL_HEIGHT,
      rx: MODE_CONTROL_HEIGHT / 2,
      ry: MODE_CONTROL_HEIGHT / 2,
      fill: '#E7EDC9',
      // The original FieldLabel text is hidden, so this painted background is
      // also the pointer target Blockly uses to identify a field click.
      'pointer-events': 'all',
    }, root);
    root.insertBefore(container, this.getTextElement());

    let x = MODE_CONTROL_PADDING_X;
    MODE_SEGMENTS.forEach((segment) => {
      const rect = Blockly.utils.dom.createSvgElement('rect', {
        x: x + 1,
        y: 2,
        width: segment.width - 2,
        height: MODE_CONTROL_HEIGHT - 4,
        rx: (MODE_CONTROL_HEIGHT - 4) / 2,
        ry: (MODE_CONTROL_HEIGHT - 4) / 2,
        'pointer-events': 'none',
      }, root);
      const text = Blockly.utils.dom.createSvgElement('text', {
        x: x + segment.width / 2,
        // SVG font metrics make the geometric midpoint appear slightly high
        // in Chromium, so use a one-pixel optical correction.
        y: MODE_CONTROL_HEIGHT / 2 + 1,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-size': '11pt',
        'font-family': 'sans-serif',
        'font-weight': 'normal',
        'pointer-events': 'none',
      }, root);
      text.textContent = segment.label;
      this.segmentRects_.push(rect);
      this.segmentTexts_.push(text);
      x += segment.width;
    });

    root.addEventListener('keydown', (event) => this.onKeyDown_(event));
    this.syncFromBlock_();
  }

  updateSize_() {
    super.updateSize_(0);
    this.size_.width = MODE_CONTROL_WIDTH;
    this.size_.height = MODE_CONTROL_HEIGHT;
    this.getTextElement()?.setAttribute('display', 'none');
    this.syncFromBlock_();
  }

  showEditor_(event) {
    const root = this.getSvgRoot();
    if (!root || !event || typeof event.clientX !== 'number') {
      this.selectNextMode_();
      return;
    }

    const bounds = root.getBoundingClientRect();
    // clientX is expressed in screen pixels, while segment widths are Blockly
    // SVG units. Convert by proportion so clicks remain correct after zooming.
    const x = Math.max(0, Math.min(MODE_CONTROL_WIDTH, (event.clientX - bounds.left) / bounds.width * MODE_CONTROL_WIDTH));
    let cursor = 0;
    const segment = MODE_SEGMENTS.find((candidate) => {
      cursor += candidate.width;
      return x < cursor + MODE_CONTROL_PADDING_X;
    }) || MODE_SEGMENTS[MODE_SEGMENTS.length - 1];
    this.selectMode_(segment.mode);
  }

  onKeyDown_(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();

    const current = getThresholdMode(this.getSourceBlock());
    const currentIndex = THRESHOLD_MODES.indexOf(current);
    if (event.key === 'ArrowLeft') {
      this.selectMode_(THRESHOLD_MODES[(currentIndex + THRESHOLD_MODES.length - 1) % THRESHOLD_MODES.length]);
    } else if (event.key === 'ArrowRight') {
      this.selectMode_(THRESHOLD_MODES[(currentIndex + 1) % THRESHOLD_MODES.length]);
    } else {
      this.selectNextMode_();
    }
  }

  selectNextMode_() {
    const currentIndex = THRESHOLD_MODES.indexOf(getThresholdMode(this.getSourceBlock()));
    this.selectMode_(THRESHOLD_MODES[(currentIndex + 1) % THRESHOLD_MODES.length]);
  }

  selectMode_(mode) {
    const block = this.getSourceBlock();
    if (!block?.isEditable?.() || !THRESHOLD_MODES.includes(mode)) return;
    setNumericStateEntityMode(block, mode);
  }

  syncFromBlock_() {
    const mode = getThresholdMode(this.getSourceBlock());
    const root = this.getSvgRoot();
    if (root) {
      root.setAttribute(
        'aria-label',
        mode === 'NONE' ? 'Numeric state threshold: no threshold selected' : `Numeric state threshold: ${mode.toLowerCase()}`
      );
    }

    MODE_SEGMENTS.forEach((segment, index) => {
      const selected = segment.mode === mode;
      const rect = this.segmentRects_[index];
      const text = this.segmentTexts_[index];
      if (rect) {
        rect.setAttribute('fill', selected ? '#F4F4F4' : 'transparent');
      }
      if (text) text.setAttribute('fill', selected ? '#000000' : '#6B7280');
    });
  }
}

Blockly.Blocks.condition_numeric_state_entity = {
  init() {
    this.appendDummyInput('ROW')
      .appendField('numeric state')
      .appendField(createNumericEntityField(), 'ENTITY_ID')
      .appendField(new NumericThresholdModeField(), 'THRESHOLD_MODE_UI');

    // Keep the pre-existing field names in a fully hidden input. YAML import,
    // generation, and old localStorage data continue to use these values,
    // while the visible row contains only the fields needed by the selected
    // mode and therefore has no leftover Blockly spacer gaps.
    this.appendDummyInput('LEGACY_THRESHOLD_FIELDS')
      .appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_ABOVE')
      .appendField(new Blockly.FieldNumber(0), 'ABOVE')
      .appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_BELOW')
      .appendField(new Blockly.FieldNumber(0), 'BELOW')
      .setVisible(false);

    // Match the Numeric State Trigger's row layout. The control itself has
    // the same SVG geometry in both blocks; using the same non-inline layout
    // keeps its vertical centring consistent with native Blockly fields.
    this.setInputsInline(false);
    this.setPreviousStatement(true, 'HA_CONDITION');
    this.setNextStatement(true, 'HA_CONDITION');
    this.setColour('#AECA3E');
    this.setTooltip('Compares an entity using its numeric state value (numeric_state).');
    this.setHelpUrl('');

    this.updateShape_();
    this.setOnChange(() => {
      if (!this.isUpdatingThresholdMode_) this.updateShape_();
    });
  },

  clearThresholdUi_() {
    const input = this.getInput('ROW');
    ['THRESHOLD_PRIMARY', 'THRESHOLD_AND', 'THRESHOLD_SECONDARY', 'THRESHOLD_UNIT']
      .forEach((fieldName) => input?.removeField(fieldName, true));
  },

  updateValidationWarning_(message) {
    updateInlineValidationWarning(this, 'ROW', message);
  },

  rebuildThresholdUi_(mode, unit) {
    this.clearThresholdUi_();
    if (mode === 'NONE') return;

    const input = this.getInput('ROW');
    const primary = createVisualThresholdField('PRIMARY');
    input.appendField(primary, 'THRESHOLD_PRIMARY');

    if (mode === 'BETWEEN') {
      input.appendField('and', 'THRESHOLD_AND');
      input.appendField(createVisualThresholdField('SECONDARY'), 'THRESHOLD_SECONDARY');
    }
    if (unit) input.appendField(unit, 'THRESHOLD_UNIT');
  },

  syncVisibleThresholdValues_(mode) {
    if (this.isEditingVisualThreshold_) return;

    const fAbove = this.getField('ABOVE');
    const fBelow = this.getField('BELOW');
    this.isSyncingThresholdVisuals_ = true;
    try {
      this.getField('THRESHOLD_PRIMARY')?.setValue(mode === 'BELOW' ? fBelow?.getValue() : fAbove?.getValue());
      this.getField('THRESHOLD_SECONDARY')?.setValue(fBelow?.getValue());
    } finally {
      this.isSyncingThresholdVisuals_ = false;
    }
  },

  updateShape_(entityId = this.getFieldValue('ENTITY_ID')) {
    const mode = getThresholdMode(this);
    const unit = getEntityUnit(entityId);
    const uiKey = `${mode}\u0000${unit}`;
    if (this.thresholdUiKey_ !== uiKey) {
      this.rebuildThresholdUi_(mode, unit);
      this.thresholdUiKey_ = uiKey;
    }
    this.syncVisibleThresholdValues_(mode);
    this.getField('THRESHOLD_MODE_UI')?.syncFromBlock_?.();

    const above = Number(this.getFieldValue('ABOVE'));
    const below = Number(this.getFieldValue('BELOW'));
    let validationMessage = '';
    if (mode === 'NONE') {
      validationMessage = 'Select an above, below, or between threshold.';
    } else if (mode === 'BETWEEN' && Number.isFinite(above) && Number.isFinite(below) && below <= above) {
      validationMessage = 'For Between, the below value must be greater than the above value.';
    }
    this.updateValidationWarning_(validationMessage);

    if (this.rendered) this.render();
  },
};

// Custom block is registered via Blockly.Blocks above.
// Keep export for index.js compatibility.
export const conditionNumericStateEntityBlocks = [];
