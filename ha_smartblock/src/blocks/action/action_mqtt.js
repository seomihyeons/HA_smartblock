// src/blocks/action/action_mqtt.js
import * as Blockly from 'blockly';

export const actionMqttBlocks = Blockly.common.createBlockDefinitionsFromJsonArray([
  {
    type: 'action_mqtt_publish',
    message0: 'mqtt topic %1',
    args0: [
      { type: 'field_input', name: 'TOPIC', text: 'home/room/topic', spellcheck: false },
    ],
    inputsInline: true,
    previousStatement: 'HA_ACTION',
    nextStatement: 'HA_ACTION',
    colour: '#E3CC57',
    tooltip: 'Publish an MQTT message.',
    helpUrl: '',
    mutator: 'ha_action_optional_data',
  },
  {
    type: 'action_mqtt_payload_text',
    message0: 'payload %1',
    args0: [
      { type: 'field_input', name: 'PAYLOAD', text: 'payload', spellcheck: true },
    ],
    previousStatement: 'HA_ACTION_MQTT_DATA',
    nextStatement: 'HA_ACTION_MQTT_DATA',
    colour: '#E3CC57',
    tooltip: 'MQTT payload text.',
    helpUrl: '',
  },
  {
    type: 'action_mqtt_qos',
    message0: 'qos %1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'QOS',
        options: [
          ['0', '0'],
          ['1', '1'],
          ['2', '2'],
        ],
      },
    ],
    previousStatement: 'HA_ACTION_MQTT_DATA',
    nextStatement: 'HA_ACTION_MQTT_DATA',
    colour: '#E3CC57',
    tooltip: 'MQTT QoS level.',
    helpUrl: '',
  },
  {
    type: 'action_mqtt_retain',
    message0: 'retain %1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'RETAIN',
        options: [
          ['false', 'false'],
          ['true', 'true'],
        ],
      },
    ],
    previousStatement: 'HA_ACTION_MQTT_DATA',
    nextStatement: 'HA_ACTION_MQTT_DATA',
    colour: '#E3CC57',
    tooltip: 'MQTT retain flag.',
    helpUrl: '',
  },
  {
    type: 'action_mqtt_evaluate_payload',
    message0: 'evaluate_payload %1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'EVAL',
        options: [
          ['false', 'false'],
          ['true', 'true'],
        ],
      },
    ],
    previousStatement: 'HA_ACTION_MQTT_DATA',
    nextStatement: 'HA_ACTION_MQTT_DATA',
    colour: '#E3CC57',
    tooltip: 'Evaluate payload as template before publish.',
    helpUrl: '',
  },
  {
    type: 'action_mqtt_data_kv',
    message0: '%1 : %2',
    args0: [
      { type: 'field_input', name: 'KEY', text: 'key', spellcheck: false },
      { type: 'field_input', name: 'VALUE', text: 'value', spellcheck: true },
    ],
    previousStatement: 'HA_ACTION_MQTT_DATA',
    nextStatement: 'HA_ACTION_MQTT_DATA',
    colour: '#E3CC57',
    tooltip: 'Fallback key/value for mqtt.publish data.',
    helpUrl: '',
  },
]);
