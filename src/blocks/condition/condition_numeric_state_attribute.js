// src/blocks/condition/condition_numeric_state_attribute.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';
import {
  createVisibleThresholdNumber,
  getThresholdMode,
  SegmentedThresholdModeField,
} from '../utils/segmented_numeric_threshold.js';

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

    if (mode === 'NONE') {
      this.setWarningText('Select an above, below, or between threshold.', 'numeric-attribute-threshold');
    } else {
      this.setWarningText(null, 'numeric-attribute-threshold');
    }

    const above = Number(this.getFieldValue('ABOVE'));
    const below = Number(this.getFieldValue('BELOW'));
    if (mode === 'BETWEEN' && Number.isFinite(above) && Number.isFinite(below) && below <= above) {
      this.setWarningText('For Between, the below value must be greater than the above value.', 'numeric-attribute-range');
    } else {
      this.setWarningText(null, 'numeric-attribute-range');
    }

    if (this.rendered) this.render();
  },
};

// Custom block is registered via Blockly.Blocks above.
// Keep export for index.js compatibility.
export const conditionNumericStateAttributeBlocks = [];
