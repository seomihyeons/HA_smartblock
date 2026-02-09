// src/blocks/action/action_notify_tag.js
import * as Blockly from 'blockly';
import { getCameraEntityOptions } from '../../data/options.js';

export const actionNotifyTagBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
  {
    type: 'action_notify_tag',
    message0: 'tag %1',
    args0: [
      { type: 'field_input', name: 'TAG_NAME', text: 'tag name', spellcheck: true },
    ],
    message1: '%1',
    args1: [
      { type: 'input_statement', name: 'TAG_BLOCKS', check: 'HA_NOTIFY_TAG' },
    ],
    previousStatement: 'HA_NOTIFY',
    nextStatement: 'HA_NOTIFY',
    colour: '#E3CC57',
    tooltip: 'notify의 data.data(payload)를 구성합니다. (tag + entity_id + actions)',
    helpUrl: '',
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
    tooltip: 'camera entity_id를 설정합니다.',
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
    tooltip: '알림 actions[]의 버튼(action id)을 시작합니다.',
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
    tooltip: '버튼 title',
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
    tooltip: 'destructive 버튼 스타일 여부',
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
]);
