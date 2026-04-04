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
    this.setTooltip('Enter a template condition. {{ }} is added automatically.');
    this.setHelpUrl('');
  },
};

export const conditionTemplateBlocks = [];
