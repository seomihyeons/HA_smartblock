// src/blocks/event/event_entity.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';
import { STATE_DOMAINS, getBinarySensorStateOptions, getStates } from '../../data/options.js';
import { updateInlineValidationWarning } from '../utils/validation_warning_field.js';

function getEntityOptions(domain, { numericOnly = false } = {}) {
  const filtered = (dummyEntities || []).filter(e => {
    const id = String(e.entity_id || '');
    if (!id.startsWith(`${domain}.`)) return false;
    if (!numericOnly) return true;
    return !Number.isNaN(Number(e.state));
  });

  if (!filtered.length) return [['(No entities)', '']];
  return filtered.map(e => [e.attributes?.friendly_name || e.entity_id, e.entity_id]);
}

// getStates(domain) = [['on','on'], ...] 그대로 쓰되 (any) 옵션만 추가
function withAny(options, { anyFirst = false } = {}) {
  const opts = (options || []).filter(([, v]) => v); // '(No states)' 같은 빈 값 제거
  if (!opts.length) return [['(any)', '']];
  const any = ['(any)', ''];
  return anyFirst ? [any, ...opts] : [...opts, any];
}

function binarySensorTriggerStateOptions({ anyFirst = false } = {}) {
  const entityId = this.getSourceBlock()?.getFieldValue('ENTITY_ID') || '';
  const options = getBinarySensorStateOptions(entityId, { includeAny: true });
  if (!anyFirst) return options;

  const any = options.find(([, value]) => value === '');
  return any ? [any, ...options.filter(([, value]) => value !== '')] : options;
}

function binarySensorTriggerFromStateOptions() {
  return binarySensorTriggerStateOptions.call(this, { anyFirst: true });
}

function refreshSemanticStateFields(block, fieldNames) {
  for (const fieldName of fieldNames) {
    const field = block.getField(fieldName);
    if (!field) continue;

    const options = field.getOptions?.(false) || [];
    const currentValue = field.getValue();
    const nextValue = options.some(([, value]) => value === currentValue)
      ? currentValue
      : options[0]?.[1];

    if (nextValue !== undefined) field.setValue(nextValue, false);
    field.forceRerender?.();
  }
}

Blockly.Extensions.register('binary_sensor_trigger_semantic_states', function () {
  const entityField = this.getField('ENTITY_ID');
  if (!entityField) return;

  const refresh = () => refreshSemanticStateFields(this, ['FROM', 'TO']);
  entityField.setValidator((newValue) => {
    // Field validators run before ENTITY_ID has been updated. Deferring lets
    // dynamic dropdowns read the newly selected runtime entity.
    queueMicrotask(refresh);
    return newValue;
  });
  refresh();
});

const labelOf = (domain) => (domain === 'binary_sensor' ? 'binary sensor' : domain);

Blockly.Extensions.register('event_trigger_optional_id', function () {
  const sync = () => {
    const useId = this.getFieldValue('USE_ID') === 'TRUE';
    const idField = this.getField('ID');
    idField?.setVisible(useId);
    if (!useId && idField) this.setFieldValue('', 'ID');
    if (this.rendered) this.render();
  };

  this.getField('USE_ID')?.setValidator((newVal) => {
    setTimeout(sync, 0);
    return newVal;
  });

  sync();
});

export const eventEntityBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    ...STATE_DOMAINS
      .map(domain => ({
        type: `event_${domain}_state`,
        message0: `${labelOf(domain)} %1 from %2 to %3 id %4 %5 %6`,
        args0: [
          { type: 'field_dropdown', name: 'ENTITY_ID', options: () => getEntityOptions(domain) },
          {
            type: 'field_dropdown',
            name: 'FROM',
            options: domain === 'binary_sensor'
              ? binarySensorTriggerFromStateOptions
              : () => withAny(getStates(domain), { anyFirst: true }),
          },
          {
            type: 'field_dropdown',
            name: 'TO',
            options: domain === 'binary_sensor'
              ? binarySensorTriggerStateOptions
              : () => withAny(getStates(domain)),
          },
          { type: 'field_checkbox', name: 'USE_ID', checked: false },
          { type: 'field_input', name: 'ID', text: '' },
          { type: 'input_value', name: 'FOR' },
        ],
        previousStatement: 'HA_EVENT',
        nextStatement: 'HA_EVENT',
        colour: 180,
        tooltip: `Triggers when the selected ${domain} entity changes state.`,
        helpUrl: '',
        extensions: domain === 'binary_sensor'
          ? ['event_trigger_optional_id', 'binary_sensor_trigger_semantic_states']
          : ['event_trigger_optional_id'],
      })),

  ]);

const NUMERIC_THRESHOLD_MODES = ['ABOVE', 'BELOW', 'BETWEEN'];
const NUMERIC_THRESHOLD_SEGMENTS = [
  { mode: 'ABOVE', label: 'Above', width: 58 },
  { mode: 'BELOW', label: 'Below', width: 56 },
  { mode: 'BETWEEN', label: 'Between', width: 74 },
];
// The Trigger lives on the teal Event palette, while retaining the same
// geometry as the Numeric State Condition control.
const NUMERIC_THRESHOLD_CONTROL_HEIGHT = 22;
const NUMERIC_THRESHOLD_CONTROL_PADDING_X = 2;
const NUMERIC_THRESHOLD_CONTROL_WIDTH = NUMERIC_THRESHOLD_SEGMENTS
  .reduce((total, segment) => total + segment.width, 0) + NUMERIC_THRESHOLD_CONTROL_PADDING_X * 2;

function getNumericStateTriggerMode(block) {
  const useAbove = block?.getFieldValue('USE_ABOVE') === 'TRUE';
  const useBelow = block?.getFieldValue('USE_BELOW') === 'TRUE';
  if (useAbove && useBelow) return 'BETWEEN';
  if (useAbove) return 'ABOVE';
  if (useBelow) return 'BELOW';
  return 'NONE';
}

class NumericTriggerVisualThresholdField extends Blockly.FieldNumber {
  // ABOVE/BELOW are the serialized source of truth. These fields only show
  // the value required by the selected threshold mode.
  isSerializable() {
    return false;
  }
}

function createNumericTriggerVisualThresholdField(role) {
  let field;
  field = new NumericTriggerVisualThresholdField(0, null, null, null, (value) => {
    const block = field.getSourceBlock();
    if (!block || block.isSyncingNumericTriggerThresholds_) return value;

    const mode = getNumericStateTriggerMode(block);
    const legacyField = role === 'PRIMARY'
      ? (mode === 'BELOW' ? 'BELOW' : 'ABOVE')
      : 'BELOW';
    if (mode === 'NONE' || (role === 'SECONDARY' && mode !== 'BETWEEN')) return value;

    block.isEditingNumericTriggerThreshold_ = true;
    try {
      block.setFieldValue(value, legacyField);
    } finally {
      block.isEditingNumericTriggerThreshold_ = false;
    }
    return value;
  });
  return field;
}

/**
 * Keeps USE_ABOVE/USE_BELOW separate from the numeric values. In particular,
 * a selected threshold with value 0 must remain distinguishable from an
 * unselected threshold.
 */
export function setNumericStateTriggerMode(block, mode) {
  if (!block || !NUMERIC_THRESHOLD_MODES.includes(mode)) return;

  const useAbove = mode === 'ABOVE' || mode === 'BETWEEN';
  const useBelow = mode === 'BELOW' || mode === 'BETWEEN';
  if (
    block.getFieldValue('USE_ABOVE') === (useAbove ? 'TRUE' : 'FALSE')
    && block.getFieldValue('USE_BELOW') === (useBelow ? 'TRUE' : 'FALSE')
  ) return;

  const existingEventGroup = Blockly.Events.getGroup();
  if (!existingEventGroup) Blockly.Events.setGroup(true);
  block.isUpdatingNumericTriggerMode_ = true;
  try {
    block.setFieldValue(useAbove ? 'TRUE' : 'FALSE', 'USE_ABOVE');
    block.setFieldValue(useBelow ? 'TRUE' : 'FALSE', 'USE_BELOW');
  } finally {
    block.isUpdatingNumericTriggerMode_ = false;
    if (!existingEventGroup) Blockly.Events.setGroup(false);
  }
  block.updateShape_?.();
}

class NumericTriggerThresholdModeField extends Blockly.FieldLabel {
  constructor() {
    super('', 'ha-numeric-trigger-threshold-mode-text');
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
      width: NUMERIC_THRESHOLD_CONTROL_WIDTH,
      height: NUMERIC_THRESHOLD_CONTROL_HEIGHT,
      rx: NUMERIC_THRESHOLD_CONTROL_HEIGHT / 2,
      ry: NUMERIC_THRESHOLD_CONTROL_HEIGHT / 2,
      fill: '#D8EBEB',
      'pointer-events': 'all',
    }, root);
    root.insertBefore(container, this.getTextElement());

    let x = NUMERIC_THRESHOLD_CONTROL_PADDING_X;
    NUMERIC_THRESHOLD_SEGMENTS.forEach((segment) => {
      const rect = Blockly.utils.dom.createSvgElement('rect', {
        x: x + 1,
        y: 2,
        width: segment.width - 2,
        height: NUMERIC_THRESHOLD_CONTROL_HEIGHT - 4,
        rx: (NUMERIC_THRESHOLD_CONTROL_HEIGHT - 4) / 2,
        ry: (NUMERIC_THRESHOLD_CONTROL_HEIGHT - 4) / 2,
        'pointer-events': 'none',
      }, root);
      const text = Blockly.utils.dom.createSvgElement('text', {
        x: x + segment.width / 2,
        y: NUMERIC_THRESHOLD_CONTROL_HEIGHT / 2 + 1,
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
    this.size_.width = NUMERIC_THRESHOLD_CONTROL_WIDTH;
    this.size_.height = NUMERIC_THRESHOLD_CONTROL_HEIGHT;
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
    const x = Math.max(0, Math.min(
      NUMERIC_THRESHOLD_CONTROL_WIDTH,
      (event.clientX - bounds.left) / bounds.width * NUMERIC_THRESHOLD_CONTROL_WIDTH,
    ));
    let cursor = 0;
    const segment = NUMERIC_THRESHOLD_SEGMENTS.find((candidate) => {
      cursor += candidate.width;
      return x < cursor + NUMERIC_THRESHOLD_CONTROL_PADDING_X;
    }) || NUMERIC_THRESHOLD_SEGMENTS[NUMERIC_THRESHOLD_SEGMENTS.length - 1];
    this.selectMode_(segment.mode);
  }

  onKeyDown_(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();

    const current = getNumericStateTriggerMode(this.getSourceBlock());
    const currentIndex = NUMERIC_THRESHOLD_MODES.indexOf(current);
    if (event.key === 'ArrowLeft') {
      this.selectMode_(NUMERIC_THRESHOLD_MODES[(currentIndex + NUMERIC_THRESHOLD_MODES.length - 1) % NUMERIC_THRESHOLD_MODES.length]);
    } else if (event.key === 'ArrowRight') {
      this.selectMode_(NUMERIC_THRESHOLD_MODES[(currentIndex + 1) % NUMERIC_THRESHOLD_MODES.length]);
    } else {
      this.selectNextMode_();
    }
  }

  selectNextMode_() {
    const currentIndex = NUMERIC_THRESHOLD_MODES.indexOf(getNumericStateTriggerMode(this.getSourceBlock()));
    this.selectMode_(NUMERIC_THRESHOLD_MODES[(currentIndex + 1) % NUMERIC_THRESHOLD_MODES.length]);
  }

  selectMode_(mode) {
    const block = this.getSourceBlock();
    if (!block?.isEditable?.() || !NUMERIC_THRESHOLD_MODES.includes(mode)) return;
    setNumericStateTriggerMode(block, mode);
  }

  syncFromBlock_() {
    const mode = getNumericStateTriggerMode(this.getSourceBlock());
    const root = this.getSvgRoot();
    if (root) {
      root.setAttribute(
        'aria-label',
        mode === 'NONE' ? 'Numeric state trigger threshold: no threshold selected' : `Numeric state trigger threshold: ${mode.toLowerCase()}`,
      );
    }
    NUMERIC_THRESHOLD_SEGMENTS.forEach((segment, index) => {
      const selected = segment.mode === mode;
      this.segmentRects_[index]?.setAttribute('fill', selected ? '#F4F4F4' : 'transparent');
      this.segmentTexts_[index]?.setAttribute('fill', selected ? '#000000' : '#54777A');
    });
  }
}

Blockly.Blocks.event_sensor_numeric_state = {
  init() {
    // Keep every visible field on FOR itself. This mirrors Blockly's JSON
    // message0 layout for ordinary state triggers: the final value connection
    // is then rendered as the compact notch at the row's right edge rather
    // than as a separate empty white input.
    this.appendValueInput('FOR')
      .appendField('sensor')
      .appendField(new Blockly.FieldDropdown(() => getEntityOptions('sensor', { numericOnly: true })), 'ENTITY_ID')
      .appendField(new NumericTriggerThresholdModeField(), 'THRESHOLD_MODE_UI')
      // Dynamic threshold fields are inserted immediately before this stable
      // metadata anchor. Keeping all of these fields in one input is the same
      // layout shape that Blockly's JSON message0 blocks use.
      .appendField('id', 'ID_LABEL')
      .appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_ID')
      .appendField(new Blockly.FieldTextInput(''), 'ID');

    // These stable, hidden field names preserve existing YAML generator and
    // workspace serialization contracts. The visible values are rebuilt from
    // them for the selected mode.
    this.appendDummyInput('LEGACY_THRESHOLD_FIELDS')
      .appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_ABOVE')
      .appendField(new Blockly.FieldNumber(0, null, null, 0.1), 'ABOVE')
      .appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_BELOW')
      .appendField(new Blockly.FieldNumber(0, null, null, 0.1), 'BELOW')
      .setVisible(false);

    // LEGACY_THRESHOLD_FIELDS is an invisible DummyInput placed after FOR.
    // Without this explicit setting Blockly infers inline layout from the
    // ValueInput -> DummyInput sequence and renders FOR as a white puzzle
    // slot. Standard state triggers use the non-inline right-edge notch.
    this.setInputsInline(false);
    this.setPreviousStatement(true, 'HA_EVENT');
    this.setNextStatement(true, 'HA_EVENT');
    this.setColour(180);
    this.setTooltip('Triggers when a numeric sensor crosses an above, below, or between threshold.');
    this.setHelpUrl('');

    Blockly.Extensions.apply('event_trigger_optional_id', this, false);
    this.updateShape_();
    this.setOnChange(() => {
      if (!this.isUpdatingNumericTriggerMode_) this.updateShape_();
    });

    // Saved workspaces created before USE_ABOVE/USE_BELOW existed used a
    // non-zero number as the only indication that a limit was active. That
    // convention could never express 0, but it can be migrated losslessly.
    queueMicrotask(() => this.migrateLegacyThresholdState_());
  },

  migrateLegacyThresholdState_() {
    if (this.didMigrateLegacyThresholdState_) return;
    this.didMigrateLegacyThresholdState_ = true;
    if (
      this.getFieldValue('USE_ABOVE') === 'TRUE'
      || this.getFieldValue('USE_BELOW') === 'TRUE'
    ) return;

    const above = Number(this.getFieldValue('ABOVE'));
    const below = Number(this.getFieldValue('BELOW'));
    if (Number.isFinite(above) && above !== 0 && Number.isFinite(below) && below !== 0) {
      setNumericStateTriggerMode(this, 'BETWEEN');
    } else if (Number.isFinite(above) && above !== 0) {
      setNumericStateTriggerMode(this, 'ABOVE');
    } else if (Number.isFinite(below) && below !== 0) {
      setNumericStateTriggerMode(this, 'BELOW');
    }
  },

  clearThresholdUi_() {
    const input = this.getInput('FOR');
    ['THRESHOLD_PRIMARY', 'THRESHOLD_AND', 'THRESHOLD_SECONDARY']
      .forEach((fieldName) => input?.removeField(fieldName, true));
  },

  updateValidationWarning_(message) {
    updateInlineValidationWarning(this, 'FOR', message);
  },

  rebuildThresholdUi_(mode) {
    this.clearThresholdUi_();
    if (mode === 'NONE') return;

    const input = this.getInput('FOR');
    // The segment control, threshold values, ID controls, and FOR connection
    // must share one inline sequence. Appending a separate dummy input made
    // Blockly render FOR as a tall external-looking white rectangle.
    let index = input.fieldRow.findIndex((field) => field.name === 'ID_LABEL');
    if (index < 0) index = input.fieldRow.length;
    index = input.insertFieldAt(index, createNumericTriggerVisualThresholdField('PRIMARY'), 'THRESHOLD_PRIMARY');
    if (mode === 'BETWEEN') {
      index = input.insertFieldAt(index, 'and', 'THRESHOLD_AND');
      input.insertFieldAt(index, createNumericTriggerVisualThresholdField('SECONDARY'), 'THRESHOLD_SECONDARY');
    }
  },

  syncVisibleThresholdValues_(mode) {
    if (this.isEditingNumericTriggerThreshold_) return;
    this.isSyncingNumericTriggerThresholds_ = true;
    try {
      const above = this.getField('ABOVE')?.getValue();
      const below = this.getField('BELOW')?.getValue();
      this.getField('THRESHOLD_PRIMARY')?.setValue(mode === 'BELOW' ? below : above);
      this.getField('THRESHOLD_SECONDARY')?.setValue(below);
    } finally {
      this.isSyncingNumericTriggerThresholds_ = false;
    }
  },

  updateShape_() {
    const mode = getNumericStateTriggerMode(this);
    if (this.thresholdUiMode_ !== mode) {
      this.rebuildThresholdUi_(mode);
      this.thresholdUiMode_ = mode;
    }
    this.syncVisibleThresholdValues_(mode);
    this.getField('THRESHOLD_MODE_UI')?.syncFromBlock_?.();

    let validationMessage = '';
    if (mode === 'NONE') {
      validationMessage = 'Select an above, below, or between threshold.';
    } else if (mode === 'BETWEEN') {
      const above = Number(this.getFieldValue('ABOVE'));
      const below = Number(this.getFieldValue('BELOW'));
      if (Number.isFinite(above) && Number.isFinite(below) && below <= above) {
        validationMessage = 'For Between, the below value must be greater than the above value.';
      }
    }
    // Clear the previous native warning if this block was created before the
    // inline warning implementation was hot-reloaded.
    this.setWarningText(null, 'numeric-trigger-threshold');
    this.updateValidationWarning_(validationMessage);

    if (this.rendered) this.render();
  },
};
