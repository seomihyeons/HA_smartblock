import * as Blockly from 'blockly';

Blockly.Blocks.condition_template = {
  init() {
    this.appendDummyInput('ROW')
      .appendField('template "{{')
      .appendField(new Blockly.FieldTextInput(''), 'TEMPLATE')
      .appendField('}}"');

    this.setPreviousStatement(true, 'HA_CONDITION');
    this.setNextStatement(true, 'HA_CONDITION');
    this.setColour('#AECA3E');
    this.setTooltip('template 조건을 입력합니다. {{ }}는 자동으로 감쌉니다.');
    this.setHelpUrl('');
  },
};

export const conditionTemplateBlocks = [];
