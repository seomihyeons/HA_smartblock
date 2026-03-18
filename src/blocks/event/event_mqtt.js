// src/blocks/event/event_mqtt.js
import * as Blockly from 'blockly';

Blockly.Blocks['ha_event_mqtt'] = {
  hasOptions_: false,
  isSyncingOptionsField_: false,

  saveExtraState() {
    return { hasOptions: this.hasOptions_ };
  },

  loadExtraState(state) {
    this.hasOptions_ = !!state?.hasOptions;
    this.updateShape_();
  },

  init() {
    this.appendDummyInput('HEAD')
      .appendField('mqtt topic')
      .appendField(new Blockly.FieldTextInput('home/room/topic'), 'TOPIC')
      .appendField('options')
      .appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_OPTIONS');

    this.setPreviousStatement(true, 'HA_EVENT');
    this.setNextStatement(true, 'HA_EVENT');
    this.setColour(180);
    this.setTooltip('MQTT trigger');
    this.setHelpUrl('');
    this.setInputsInline(true);

    this.getField('USE_OPTIONS')?.setValidator((newVal) => {
      if (this.isSyncingOptionsField_) return newVal;
      this.hasOptions_ = newVal === 'TRUE';
      this.updateShape_();
      return newVal;
    });

    this.updateShape_();
  },

  updateShape_() {
    const inputName = 'OPTIONS';
    const hasInput = !!this.getInput(inputName);

    if (this.hasOptions_ && !hasInput) {
      this.appendStatementInput(inputName)
        .setCheck('HA_EVENT_MQTT_OPT')
        .appendField('options');
      this.setInputsInline(false);
    } else if (!this.hasOptions_ && hasInput) {
      this.removeInput(inputName);
      this.setInputsInline(true);
    }

    const expected = this.hasOptions_ ? 'TRUE' : 'FALSE';
    if (this.getFieldValue('USE_OPTIONS') !== expected) {
      this.isSyncingOptionsField_ = true;
      this.setFieldValue(expected, 'USE_OPTIONS');
      this.isSyncingOptionsField_ = false;
    }
    if (this.rendered) this.render();
  },
};

Blockly.Blocks['ha_event_mqtt_encoding'] = {
  init() {
    this.appendDummyInput('ROW')
      .appendField('encoding')
      .appendField(new Blockly.FieldDropdown([
        ['utf-8', 'utf-8'],
        ['binary ("")', 'binary'],
        ['custom', 'custom'],
      ]), 'MODE')
      .appendField(new Blockly.FieldTextInput('latin-1'), 'CUSTOM');

    this.setPreviousStatement(true, 'HA_EVENT_MQTT_OPT');
    this.setNextStatement(true, 'HA_EVENT_MQTT_OPT');
    this.setColour(180);
    this.setTooltip('MQTT encoding');
    this.setHelpUrl('');
    this.setInputsInline(true);

    this.getField('MODE')?.setValidator((newVal) => {
      setTimeout(() => this.updateShape_(), 0);
      return newVal;
    });
    this.updateShape_();
  },

  updateShape_() {
    const mode = String(this.getFieldValue('MODE') || 'utf-8');
    this.getField('CUSTOM')?.setVisible(mode === 'custom');
    if (this.rendered) this.render();
  },
};

export const eventMqttBlocks = Blockly.common.createBlockDefinitionsFromJsonArray([
  {
    type: 'ha_event_mqtt_payload',
    message0: 'payload %1',
    args0: [
      { type: 'field_input', name: 'VALUE', text: 'payload' },
    ],
    previousStatement: 'HA_EVENT_MQTT_OPT',
    nextStatement: 'HA_EVENT_MQTT_OPT',
    colour: 180,
    tooltip: 'MQTT payload filter',
    helpUrl: '',
  },
  {
    type: 'ha_event_mqtt_value_template',
    message0: 'value_template %1',
    args0: [
      { type: 'field_input', name: 'VALUE', text: '{{ value_json.key }}' },
    ],
    previousStatement: 'HA_EVENT_MQTT_OPT',
    nextStatement: 'HA_EVENT_MQTT_OPT',
    colour: 180,
    tooltip: 'MQTT value template',
    helpUrl: '',
  },
]);
