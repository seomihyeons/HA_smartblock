import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';
import { SegmentedThresholdModeField, createVisibleThresholdNumber, getThresholdMode } from '../utils/segmented_numeric_threshold.js';
import { updateInlineValidationWarning } from '../utils/validation_warning_field.js';

export function getEntitiesWithNumericAttributes(entities = dummyEntities) { return (entities || []).filter((entity) => Object.values(entity.attributes || {}).some((value) => Number.isFinite(Number.parseFloat(value)))); }
export function getNumericAttributeEntityOptions(entities = dummyEntities) { const values = getEntitiesWithNumericAttributes(entities); return values.length ? values.map((entity) => [entity.attributes?.friendly_name || entity.entity_id, entity.entity_id]) : [['(No numeric attribute entities found)', '']]; }
export function getNumericAttributeOptions(entityId, entities = dummyEntities) { const attrs = (entities || []).find((entity) => entity.entity_id === entityId)?.attributes || {}; const values = Object.keys(attrs).filter((key) => Number.isFinite(Number.parseFloat(attrs[key]))); return values.length ? values.map((key) => [key, key]) : [['(No numeric attributes)', '']]; }

Blockly.Blocks.condition_numeric_state_attribute = {
  init() {
    this.appendDummyInput('ROW').appendField('numeric attribute')
      .appendField(new Blockly.FieldDropdown(() => getNumericAttributeEntityOptions(), (id) => { this.updateThresholdUi_(); return id; }), 'ENTITY_ID')
      .appendField('attribute').appendField(new Blockly.FieldDropdown(() => getNumericAttributeOptions(this.getFieldValue('ENTITY_ID'))), 'ATTRIBUTE')
      .appendField(new SegmentedThresholdModeField({ label: 'Numeric attribute threshold' }), 'THRESHOLD_MODE_UI');
    this.appendDummyInput('LEGACY_THRESHOLD_FIELDS').appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_ABOVE').appendField(new Blockly.FieldNumber(0), 'ABOVE').appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_BELOW').appendField(new Blockly.FieldNumber(0), 'BELOW').setVisible(false);
    this.setPreviousStatement(true, 'HA_CONDITION'); this.setNextStatement(true, 'HA_CONDITION'); this.setColour('#AECA3E'); this.setTooltip('Runs a numeric_state comparison using a numeric entity attribute.'); this.setHelpUrl(''); this.updateThresholdUi_();
    this.setOnChange(() => { if (!this.isUpdatingThresholdMode_) this.updateThresholdUi_(); });
  },
  updateThresholdUi_() {
    const mode = getThresholdMode(this); const row = this.getInput('ROW'); ['THRESHOLD_PRIMARY', 'THRESHOLD_AND', 'THRESHOLD_SECONDARY'].forEach((name) => row?.removeField(name, true));
    if (mode !== 'NONE') { row.appendField(createVisibleThresholdNumber('PRIMARY'), 'THRESHOLD_PRIMARY'); if (mode === 'BETWEEN') { row.appendField('and', 'THRESHOLD_AND'); row.appendField(createVisibleThresholdNumber('SECONDARY'), 'THRESHOLD_SECONDARY'); } this.isSyncingThresholdUi_ = true; try { this.getField('THRESHOLD_PRIMARY')?.setValue(mode === 'BELOW' ? this.getFieldValue('BELOW') : this.getFieldValue('ABOVE')); this.getField('THRESHOLD_SECONDARY')?.setValue(this.getFieldValue('BELOW')); } finally { this.isSyncingThresholdUi_ = false; } }
    const above = Number(this.getFieldValue('ABOVE')); const below = Number(this.getFieldValue('BELOW'));
    updateInlineValidationWarning(this, 'ROW', mode === 'NONE' ? 'Select an above, below, or between threshold.' : (mode === 'BETWEEN' && below <= above ? 'For Between, the below value must be greater than the above value.' : ''));
    this.getField('THRESHOLD_MODE_UI')?.syncFromBlock_?.(); this.render?.();
  },
};
export const conditionNumericStateAttributeBlocks = [];
