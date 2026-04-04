// src/blocks/action/action_notify_tag.js
import * as Blockly from 'blockly';
import { getCameraEntityOptions } from '../../data/options.js';

export const actionNotifyTagBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
  {
    type: 'action_notify_tag',
    message0: 'tag %1 details %2',
    args0: [
      { type: 'field_input', name: 'TAG_NAME', text: 'tag name', spellcheck: true },
      { type: 'field_checkbox', name: 'USE_DETAILS', checked: false },
    ],
    previousStatement: 'HA_NOTIFY',
    nextStatement: 'HA_NOTIFY',
    colour: '#E3CC57',
    tooltip: 'Builds notify data.data (payload) with tag, entity_id, and actions.',
    helpUrl: '',
    mutator: 'ha_notify_tag_optional_details',
  },

  {
    type: 'notify_tag',
    message0: 'entity %1',
    args0: [
      { type: 'field_dropdown', name: 'ENTITY_ID', options: getCameraEntityOptions },
    ],
    previousStatement: 'HA_NOTIFY_TAG',
    nextStatement: 'HA_NOTIFY_TAG',
    colour: '#E3CC57',
    tooltip: 'Sets the camera entity_id.',
    helpUrl: '',
  },

  // (버튼 1개) actions[]의 원소를 시작하는 블록
  {
    type: 'notify_action',
    message0: 'action %1',
    args0: [
      { type: 'field_input', name: 'ACTION_ID', text: 'unlock_front_door', spellcheck: true },
    ],
    previousStatement: 'HA_NOTIFY_TAG',
    nextStatement: 'HA_NOTIFY_TAG',
    colour: '#E3CC57',
    tooltip: 'Starts a button entry in notify actions[] using the action id.',
    helpUrl: '',
  },

  {
    type: 'notify_prop_title',
    message0: 'title %1',
    args0: [
      { type: 'field_input', name: 'TITLE', text: 'Unlock Front Door', spellcheck: true },
    ],
    previousStatement: 'HA_NOTIFY_TAG',
    nextStatement: 'HA_NOTIFY_TAG',
    colour: '#E3CC57',
    tooltip: 'Button title.',
    helpUrl: '',
  },

  {
    type: 'notify_prop_destructive',
    message0: 'destructive %1',
    args0: [
      { type: 'field_dropdown', name: 'DESTRUCTIVE', options: [['true', 'true'], ['false', 'false']] },
    ],
    previousStatement: 'HA_NOTIFY_TAG',
    nextStatement: 'HA_NOTIFY_TAG',
    colour: '#E3CC57',
    tooltip: 'Whether to use the destructive button style.',
    helpUrl: '',
  },

  {
    type: 'notify_prop_activationMode',
    message0: 'activationMode %1',
    args0: [
      { type: 'field_dropdown', name: 'MODE', options: [['background', 'background'], ['foreground', 'foreground']] },
    ],
    previousStatement: 'HA_NOTIFY_TAG',
    nextStatement: 'HA_NOTIFY_TAG',
    colour: '#E3CC57',
    tooltip: 'activationMode (background/foreground)',
    helpUrl: '',
  },
  {
    type: 'notify_push',
    message0: 'push %1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'PUSH_KIND',
        options: [
          ['sound', 'sound'],
          ['badge', 'badge'],
        ],
      },
    ],
    message1: '%1',
    args1: [
      { type: 'input_statement', name: 'PUSH_BLOCKS', check: 'HA_NOTIFY_PUSH' },
    ],
    previousStatement: ['HA_NOTIFY', 'HA_NOTIFY_TAG'],
    nextStatement: ['HA_NOTIFY', 'HA_NOTIFY_TAG'],
    colour: '#E3CC57',
    tooltip: 'Builds the notify data.data.push option.',
    helpUrl: '',
  },
  {
    type: 'notify_push_name',
    message0: 'name %1',
    args0: [
      { type: 'field_input', name: 'NAME', text: 'default', spellcheck: false },
    ],
    previousStatement: 'HA_NOTIFY_PUSH',
    nextStatement: 'HA_NOTIFY_PUSH',
    colour: '#E3CC57',
    tooltip: 'push.sound.name',
    helpUrl: '',
  },
  {
    type: 'notify_push_critical',
    message0: 'critical %1 volume %2',
    args0: [
      { type: 'field_number', name: 'CRITICAL', value: 1, min: 0, max: 1, precision: 1 },
      { type: 'field_number', name: 'VOLUME', value: 1.0, min: 0, max: 1, precision: 0.1 },
    ],
    previousStatement: 'HA_NOTIFY_PUSH',
    nextStatement: 'HA_NOTIFY_PUSH',
    colour: '#E3CC57',
    tooltip: 'push.sound.critical / push.sound.volume',
    helpUrl: '',
  },
]);
