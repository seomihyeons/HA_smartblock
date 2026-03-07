// src/blocks/condition/condition_numeric_state_attribute.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';

function getEntitiesWithNumericAttributes() {
  return dummyEntities.filter((entity) => {
    const attrs = entity.attributes || {};
    return Object.values(attrs).some((v) => !isNaN(parseFloat(v)));
  });
}

function getEntityOptions() {
  const list = getEntitiesWithNumericAttributes();
  return list.length
    ? list.map((e) => [e.attributes?.friendly_name || e.entity_id, e.entity_id])
    : [['(No numeric attribute entities found)', '']];
}

function getAttributeOptions() {
  const block = this.getSourceBlock?.();
  const entityId = block?.getFieldValue('ENTITY_ID');
  const entity = dummyEntities.find((e) => e.entity_id === entityId);
  if (!entity) return [['(Select entity first)', '']];
  const attrs = entity.attributes || {};
  const numericAttrs = Object.keys(attrs).filter((k) => !isNaN(parseFloat(attrs[k])));
  return numericAttrs.length
    ? numericAttrs.map((a) => [a, a])
    : [['(No numeric attributes)', '']];
}

Blockly.Blocks['condition_numeric_state_attribute'] = {
  init: function () {
    this.appendDummyInput('ROW')
      .appendField('numeric attribute')
      .appendField(new Blockly.FieldDropdown(getEntityOptions), 'ENTITY_ID')
      .appendField('attribute')
      .appendField(new Blockly.FieldDropdown(getAttributeOptions), 'ATTRIBUTE')
      .appendField('above')
      .appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_ABOVE')
      .appendField(new Blockly.FieldNumber(0), 'ABOVE')
      .appendField('below')
      .appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_BELOW')
      .appendField(new Blockly.FieldNumber(0), 'BELOW');

    this.setInputsInline(true);
    this.setPreviousStatement(true, 'HA_CONDITION');
    this.setNextStatement(true, 'HA_CONDITION');
    this.setColour('#AECA3E');
    this.setTooltip('엔티티의 숫자형 속성(attribute)을 기준으로 numeric_state 비교를 수행합니다.');
    this.setHelpUrl('');

    this.updateShape_();
    this.setOnChange(() => this.updateShape_());
  },

  updateShape_: function () {
    const useAbove = this.getFieldValue('USE_ABOVE') === 'TRUE';
    const useBelow = this.getFieldValue('USE_BELOW') === 'TRUE';

    const fAbove = this.getField('ABOVE');
    const fBelow = this.getField('BELOW');
    if (fAbove) fAbove.setVisible(useAbove);
    if (fBelow) fBelow.setVisible(useBelow);

    if (this.rendered) this.render();
  },
};

// Custom block is registered via Blockly.Blocks above.
// Keep export for index.js compatibility.
export const conditionNumericStateAttributeBlocks = [];
