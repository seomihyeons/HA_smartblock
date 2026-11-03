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

const MODES = ['ABOVE', 'BELOW', 'BETWEEN'];
const SEGMENTS = [{ mode: 'ABOVE', label: 'Above', width: 58 }, { mode: 'BELOW', label: 'Below', width: 56 }, { mode: 'BETWEEN', label: 'Between', width: 74 }];
const CONTROL_WIDTH = 192;
function triggerMode(block) { const above = block?.getFieldValue('USE_ABOVE') === 'TRUE'; const below = block?.getFieldValue('USE_BELOW') === 'TRUE'; return above && below ? 'BETWEEN' : above ? 'ABOVE' : below ? 'BELOW' : 'NONE'; }
export function setNumericStateTriggerMode(block, mode) { if (!block || !MODES.includes(mode)) return; block.isUpdatingNumericTriggerMode_ = true; try { block.setFieldValue(mode === 'ABOVE' || mode === 'BETWEEN' ? 'TRUE' : 'FALSE', 'USE_ABOVE'); block.setFieldValue(mode === 'BELOW' || mode === 'BETWEEN' ? 'TRUE' : 'FALSE', 'USE_BELOW'); } finally { block.isUpdatingNumericTriggerMode_ = false; } block.updateShape_?.(); }
class TriggerValue extends Blockly.FieldNumber { isSerializable() { return false; } }
function triggerValue(role) { let field; field = new TriggerValue(0, null, null, null, (value) => { const block = field.getSourceBlock(); if (!block || block.syncingTriggerValues_) return value; block.setFieldValue(value, role === 'SECONDARY' || triggerMode(block) === 'BELOW' ? 'BELOW' : 'ABOVE'); return value; }); return field; }
class TriggerModeField extends Blockly.FieldLabel {
  constructor() { super('', 'ha-numeric-trigger-threshold-mode-text'); this.rects_ = []; this.texts_ = []; }
  isClickable() { return true; } isClickableInFlyout() { return false; }
  initView() { super.initView(); this.getTextElement()?.setAttribute('display', 'none'); const root = this.getSvgRoot(); if (!root || this.rects_.length) return; root.setAttribute('role', 'button'); root.setAttribute('tabindex', '0'); root.style.cursor = 'pointer'; const outer = Blockly.utils.dom.createSvgElement('rect', { x: 0, y: 0, width: CONTROL_WIDTH, height: 22, rx: 11, ry: 11, fill: '#D8EBEB', 'pointer-events': 'all' }, root); root.insertBefore(outer, this.getTextElement()); let x = 2; SEGMENTS.forEach((segment) => { const rect = Blockly.utils.dom.createSvgElement('rect', { x: x + 1, y: 2, width: segment.width - 2, height: 18, rx: 9, ry: 9, 'pointer-events': 'none' }, root); const text = Blockly.utils.dom.createSvgElement('text', { x: x + segment.width / 2, y: 12, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': '11pt', 'font-family': 'sans-serif', 'font-weight': 'normal', 'pointer-events': 'none' }, root); text.textContent = segment.label; this.rects_.push(rect); this.texts_.push(text); x += segment.width; }); this.sync_(); }
  updateSize_() { super.updateSize_(0); this.size_.width = CONTROL_WIDTH; this.size_.height = 22; this.getTextElement()?.setAttribute('display', 'none'); this.sync_(); }
  showEditor_(event) { const root = this.getSvgRoot(); const bounds = root?.getBoundingClientRect(); if (!bounds || !event) return; setNumericStateTriggerMode(this.getSourceBlock(), MODES[Math.min(2, Math.max(0, Math.floor((event.clientX - bounds.left) / bounds.width * 3)))]); }
  sync_() { const mode = triggerMode(this.getSourceBlock()); SEGMENTS.forEach((segment, index) => { const chosen = segment.mode === mode; this.rects_[index]?.setAttribute('fill', chosen ? '#F4F4F4' : 'transparent'); this.texts_[index]?.setAttribute('fill', chosen ? '#000000' : '#54777A'); }); }
}
Blockly.Blocks.event_sensor_numeric_state = {
  init() {
    this.appendValueInput('FOR').appendField('sensor').appendField(new Blockly.FieldDropdown(() => getEntityOptions('sensor', { numericOnly: true })), 'ENTITY_ID').appendField(new TriggerModeField(), 'THRESHOLD_MODE_UI').appendField('id', 'ID_LABEL').appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_ID').appendField(new Blockly.FieldTextInput(''), 'ID');
    this.appendDummyInput('LEGACY_THRESHOLD_FIELDS').appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_ABOVE').appendField(new Blockly.FieldNumber(0), 'ABOVE').appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_BELOW').appendField(new Blockly.FieldNumber(0), 'BELOW').setVisible(false);
    this.setInputsInline(false); this.setPreviousStatement(true, 'HA_EVENT'); this.setNextStatement(true, 'HA_EVENT'); this.setColour(180); this.setTooltip('Triggers when a numeric sensor crosses an above, below, or between threshold.'); Blockly.Extensions.apply('event_trigger_optional_id', this, false); this.updateShape_(); this.setOnChange(() => { if (!this.isUpdatingNumericTriggerMode_) this.updateShape_(); });
  },
  updateShape_() { const mode = triggerMode(this); const input = this.getInput('FOR'); ['THRESHOLD_PRIMARY', 'THRESHOLD_AND', 'THRESHOLD_SECONDARY'].forEach((name) => input?.removeField(name, true)); if (mode !== 'NONE') { let i = input.fieldRow.findIndex((field) => field.name === 'ID_LABEL'); i = input.insertFieldAt(i, triggerValue('PRIMARY'), 'THRESHOLD_PRIMARY'); if (mode === 'BETWEEN') { i = input.insertFieldAt(i, 'and', 'THRESHOLD_AND'); input.insertFieldAt(i, triggerValue('SECONDARY'), 'THRESHOLD_SECONDARY'); } this.syncingTriggerValues_ = true; try { this.getField('THRESHOLD_PRIMARY')?.setValue(mode === 'BELOW' ? this.getFieldValue('BELOW') : this.getFieldValue('ABOVE')); this.getField('THRESHOLD_SECONDARY')?.setValue(this.getFieldValue('BELOW')); } finally { this.syncingTriggerValues_ = false; } } const above = Number(this.getFieldValue('ABOVE')); const below = Number(this.getFieldValue('BELOW')); updateInlineValidationWarning(this, 'FOR', mode === 'NONE' ? 'Select an above, below, or between threshold.' : (mode === 'BETWEEN' && below <= above ? 'For Between, the below value must be greater than the above value.' : '')); this.getField('THRESHOLD_MODE_UI')?.sync_?.(); if (this.rendered) this.render(); },
};
