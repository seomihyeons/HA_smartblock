import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';
import { SegmentedThresholdModeField, createVisibleThresholdNumber, getThresholdMode } from '../utils/segmented_numeric_threshold.js';
import { updateInlineValidationWarning } from '../utils/validation_warning_field.js';

function getNumericEntities() {
  const options = dummyEntities.filter((entity) => Number.isFinite(Number.parseFloat(entity.state)))
    .map((entity) => [entity.attributes?.friendly_name || entity.entity_id, entity.entity_id]);
  return options.length ? options : [['(No numeric entities)', '']];
}
function unitFor(entityId) { return String(dummyEntities.find((entity) => entity.entity_id === entityId)?.attributes?.unit_of_measurement || '').trim(); }

Blockly.Blocks.condition_numeric_state_entity = {
  init() {
    this.appendDummyInput('ROW').appendField('numeric state')
      .appendField(new Blockly.FieldDropdown(getNumericEntities, (id) => { this.updateThresholdUi_(id); return id; }), 'ENTITY_ID')
      .appendField(new SegmentedThresholdModeField({ label: 'Numeric state threshold' }), 'THRESHOLD_MODE_UI');
    this.appendDummyInput('LEGACY_THRESHOLD_FIELDS')
      .appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_ABOVE').appendField(new Blockly.FieldNumber(0), 'ABOVE')
      .appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_BELOW').appendField(new Blockly.FieldNumber(0), 'BELOW').setVisible(false);
    this.setPreviousStatement(true, 'HA_CONDITION'); this.setNextStatement(true, 'HA_CONDITION'); this.setColour('#AECA3E');
    this.setTooltip('Compares an entity using its numeric state value.'); this.setHelpUrl(''); this.updateThresholdUi_();
    this.setOnChange(() => { if (!this.isUpdatingThresholdMode_) this.updateThresholdUi_(); });
  },
  updateThresholdUi_(entityId = this.getFieldValue('ENTITY_ID')) {
    const mode = getThresholdMode(this); const row = this.getInput('ROW');
    ['THRESHOLD_PRIMARY', 'THRESHOLD_AND', 'THRESHOLD_SECONDARY', 'THRESHOLD_UNIT'].forEach((name) => row?.removeField(name, true));
    if (mode !== 'NONE') {
      row.appendField(createVisibleThresholdNumber('PRIMARY'), 'THRESHOLD_PRIMARY');
      if (mode === 'BETWEEN') { row.appendField('and', 'THRESHOLD_AND'); row.appendField(createVisibleThresholdNumber('SECONDARY'), 'THRESHOLD_SECONDARY'); }
      const unit = unitFor(entityId); if (unit) row.appendField(unit, 'THRESHOLD_UNIT');
      this.isSyncingThresholdUi_ = true;
      try { this.getField('THRESHOLD_PRIMARY')?.setValue(mode === 'BELOW' ? this.getFieldValue('BELOW') : this.getFieldValue('ABOVE')); this.getField('THRESHOLD_SECONDARY')?.setValue(this.getFieldValue('BELOW')); } finally { this.isSyncingThresholdUi_ = false; }
    }
    const above = Number(this.getFieldValue('ABOVE')); const below = Number(this.getFieldValue('BELOW'));
    updateInlineValidationWarning(this, 'ROW', mode === 'NONE' ? 'Select an above, below, or between threshold.' : (mode === 'BETWEEN' && below <= above ? 'For Between, the below value must be greater than the above value.' : ''));
    this.getField('THRESHOLD_MODE_UI')?.syncFromBlock_?.(); this.render?.();
  },
};
export const conditionNumericStateEntityBlocks = [];
