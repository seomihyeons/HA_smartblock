// src/blocks/condition/condition_numeric_state_entity.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';

function getNumericEntities() {
  return dummyEntities
    .filter((e) => {
      const v = parseFloat(e.state);
      return !isNaN(v);
    })
    .map((e) => [e.attributes?.friendly_name || e.entity_id, e.entity_id]);
}

Blockly.Blocks['condition_numeric_state_entity'] = {
  init: function () {
    this.appendDummyInput('ROW')
      .appendField('numeric state')
      .appendField(new Blockly.FieldDropdown(getNumericEntities), 'ENTITY_ID')
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
    this.setTooltip('Compares an entity using its numeric state value (numeric_state).');
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
export const conditionNumericStateEntityBlocks = [];
