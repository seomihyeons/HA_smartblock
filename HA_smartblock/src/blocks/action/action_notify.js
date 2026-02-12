// src/blocks/action/action_notify.js
import * as Blockly from 'blockly';
import { getNotifyTargetOptions, NOTIFY_TEMPLATE_KINDS } from '../../data/options.js';

export const actionNotifyBlocks = Blockly.common.createBlockDefinitionsFromJsonArray([
  {
    type: 'action_notify',
    message0: 'notify %1',
    args0: [
      { type: 'field_dropdown', name: 'TARGET', options: getNotifyTargetOptions },
    ],
    message1: '%1',
    args1: [ { type: 'input_statement', name: 'MESSAGE_BLOCKS', check: 'HA_NOTIFY' }, ],
    previousStatement: 'HA_ACTION',
    nextStatement: 'HA_ACTION',
    colour: '#E3CC57',
    tooltip: 'notify 대상과 message를 한 블록에서 입력합니다. 아래에 tag/entity/actions를 선택 연결할 수 있습니다.',
    helpUrl: '',
  },
  // Legacy compatibility blocks: keep definitions so old saved workspaces can load.
  {
    type: 'action_message',
    message0: 'message',
    message1: '%1',
    args1: [ { type: 'input_statement', name: 'MESSAGE_BLOCKS', check: 'HA_NOTIFY' } ],
    previousStatement: 'HA_NOTIFY',
    nextStatement: 'HA_NOTIFY',
    colour: '#E3CC57',
    tooltip: 'Legacy block (kept for compatibility).',
    helpUrl: '',
  },
  {
    type: 'action_notify_message_text',
    message0: 'text %1',
    args0: [ { type: 'field_input', name: 'TEXT', text: 'input message', spellcheck: true } ],
    previousStatement: 'HA_NOTIFY',
    nextStatement: 'HA_NOTIFY',
    colour: '#E3CC57',
    tooltip: 'Legacy block (kept for compatibility).',
    helpUrl: '',
  },
  {
    type: 'action_notify_message_template',
    message0: 'template %1',
    args0: [ { type: 'field_dropdown', name: 'TEMPLATE_KIND', options: NOTIFY_TEMPLATE_KINDS } ],
    previousStatement: 'HA_NOTIFY',
    nextStatement: 'HA_NOTIFY',
    colour: '#E3CC57',
    tooltip: 'Legacy block (kept for compatibility).',
    helpUrl: '',
  },
]);
