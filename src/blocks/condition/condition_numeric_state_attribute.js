// src/blocks/condition/condition_numeric_state_attribute.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';
import {
  createVisibleThresholdNumber,
  getThresholdMode,
  SegmentedThresholdModeField,
} from '../utils/segmented_numeric_threshold.js';
import { ValidationWarningField } from '../utils/validation_warning_field.js';

export function getEntitiesWithNumericAttributes(entities = dummyEntities) {
  return (entities || []).filter((entity) => {
    const attrs = entity.attributes || {};
    return Object.values(attrs).some((v) => !isNaN(parseFloat(v)));
  });
}

export function getNumericAttributeEntityOptions(entities = dummyEntities) {
  const list = getEntitiesWithNumericAttributes(entities);
  return list.length
    ? list.map((e) => [e.attributes?.friendly_name || e.entity_id, e.entity_id])
    : [['(No numeric attribute entities found)', '']];
}

export function getNumericAttributeOptions(entityId, entities = dummyEntities) {
  const entity = (entities || []).find((e) => e.entity_id === entityId);
  if (!entity) return [['(Select entity first)', '']];
  const attrs = entity.attributes || {};
  const numericAttrs = Object.keys(attrs).filter((k) => !isNaN(parseFloat(attrs[k])));
  return numericAttrs.length
    ? numericAttrs.map((a) => [a, a])
    : [['(No numeric attributes)', '']];
}

function getEntityOptions() {
  return getNumericAttributeEntityOptions();
}

function getAttributeOptions() {
  const block = this.getSourceBlock?.();
  return getNumericAttributeOptions(block?.getFieldValue('ENTITY_ID'));
}

Blockly.Blocks['condition_numeric_state_attribute'] = {
  init: function () {
    this.appendDummyInput('ROW')
      .appendField('numeric attribute')
      .appendField(new Blockly.FieldDropdown(getEntityOptions), 'ENTITY_ID')
      .appendField('attribute')
      .appendField(new Blockly.FieldDropdown(getAttributeOptions), 'ATTRIBUTE')
      .appendField(new SegmentedThresholdModeField({
        containerFill: '#E7EDC9',
        unselectedText: '#6B7280',
        ariaPrefix: 'Numeric attribute threshold',
      }), 'THRESHOLD_MODE_UI');

    // Preserve the existing field names for generators, importers, and saved
    // workspaces. The visible fields below are a presentation of this state.
    this.appendDummyInput('LEGACY_THRESHOLD_FIELDS')
      .appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_ABOVE')
      .appendField(new Blockly.FieldNumber(0, null, null, 0.1), 'ABOVE')
      .appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_BELOW')
      .appendField(new Blockly.FieldNumber(0, null, null, 0.1), 'BELOW')
      .setVisible(false);

    this.setInputsInline(false);
    this.setPreviousStatement(true, 'HA_CONDITION');
    this.setNextStatement(true, 'HA_CONDITION');
    this.setColour('#AECA3E');
    this.setTooltip('Runs a numeric_state comparison using a numeric entity attribute.');
    this.setHelpUrl('');

    this.updateShape_();
    this.setOnChange(() => {
      if (!this.isUpdatingThresholdMode_) this.updateShape_();
    });
  },

  clearThresholdUi_: function () {
    const input = this.getInput('ROW');
    ['THRESHOLD_PRIMARY', 'THRESHOLD_AND', 'THRESHOLD_SECONDARY']
      .forEach((fieldName) => input?.removeField(fieldName, true));
  },

  updateValidationWarning_: function (message) {
    const input = this.getInput('ROW');
    if (!input) return;
    const nextMessage = String(message || '').trim();
    let field = this.getField('VALIDATION_WARNING');

    if (!nextMessage) {
      // A hidden Field still leaves Blockly's separator spacing in this row.
      // Remove it completely once the validation problem is resolved.
      if (field) input.removeField('VALIDATION_WARNING', true);
      return;
    }

    if (!field) {
      field = new ValidationWarningField();
      input.insertFieldAt(0, field, 'VALIDATION_WARNING');
    }
    field.setMessage(nextMessage);
  },

  rebuildThresholdUi_: function (mode) {
    this.clearThresholdUi_();
    if (mode === 'NONE') return;
    const input = this.getInput('ROW');
    input.appendField(createVisibleThresholdNumber('PRIMARY'), 'THRESHOLD_PRIMARY');
    if (mode === 'BETWEEN') {
      input.appendField('and', 'THRESHOLD_AND');
      input.appendField(createVisibleThresholdNumber('SECONDARY'), 'THRESHOLD_SECONDARY');
    }
  },

  syncVisibleThresholdValues_: function (mode) {
    if (this.isEditingThresholdVisual_) return;
    this.isSyncingThresholdVisuals_ = true;
    try {
      const above = this.getField('ABOVE')?.getValue();
      const below = this.getField('BELOW')?.getValue();
      this.getField('THRESHOLD_PRIMARY')?.setValue(mode === 'BELOW' ? below : above);
      this.getField('THRESHOLD_SECONDARY')?.setValue(below);
    } finally {
      this.isSyncingThresholdVisuals_ = false;
    }
  },

  updateShape_: function () {
    const mode = getThresholdMode(this);
    if (this.thresholdUiMode_ !== mode) {
      this.rebuildThresholdUi_(mode);
      this.thresholdUiMode_ = mode;
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
export const conditionNumericStateAttributeBlocks = [];
