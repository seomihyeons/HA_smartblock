import * as Blockly from 'blockly';

Blockly.Blocks.condition_template = {
  init() {
    this.appendDummyInput('ROW')
      .appendField('template "{{')
      .appendField(new Blockly.FieldTextInput(''), 'TEMPLATE')
      .appendField('}}"')
      // These fields retain the parsed source supplied by the importer.  They
      // live on the visible row but are hidden, so source fidelity does not
      // add an empty Blockly row or change the block's public UI.
      .appendField(new Blockly.FieldLabelSerializable(''), 'SOURCE_TEMPLATE')
      .appendField(new Blockly.FieldLabelSerializable(''), 'SOURCE_TEMPLATE_EXPR');

    this.getField('SOURCE_TEMPLATE')?.setVisible(false);
    this.getField('SOURCE_TEMPLATE_EXPR')?.setVisible(false);

    this.setPreviousStatement(true, 'HA_CONDITION');
    this.setNextStatement(true, 'HA_CONDITION');
    this.setColour('#AECA3E');
    this.setTooltip('Enter a template condition. {{ }} is added automatically.');
    this.setHelpUrl('');
  },
};

export const conditionTemplateBlocks = [];
