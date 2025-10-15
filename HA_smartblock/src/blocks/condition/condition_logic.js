//src/blocks/condition/condition_logic.js
import * as Blockly from 'blockly';

export const conditionLogicBlocks = {
  'condition_logic': {
    init: function () {
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown([
          ['and', 'AND'],
          ['or', 'OR'],
          ['not', 'NOT']
        ]), 'LOGIC');

      this.appendStatementInput('SUBCONDITIONS')
        .setCheck(['RULE_PART','HA_CONDITION'])

      this.setPreviousStatement(true, 'HA_CONDITION');
      this.setNextStatement(true, 'HA_CONDITION');

      this.setColour("AECA3E");
      this.setTooltip('조건들을 and/or로 묶습니다.');
      this.setHelpUrl('');
    }
  }
};
