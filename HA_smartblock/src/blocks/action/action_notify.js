// src/blocks/action/action_notify.js
import * as Blockly from 'blockly';
import { getNotifyTargetOptions, NOTIFY_TEMPLATE_KINDS } from '../../data/options.js';

export const actionNotifyBlocks = Blockly.common.createBlockDefinitionsFromJsonArray([
  {
    type: 'action_notify',
    message0: 'notify %1',
    args0: [ { type: 'field_dropdown', name: 'TARGET', options: getNotifyTargetOptions }, ],
    message1: '%1',
    args1: [ { type: 'input_statement', name: 'MESSAGE_BLOCKS', check: 'HA_NOTIFY' }, ],
    previousStatement: 'HA_ACTION',
    nextStatement: 'HA_ACTION',
    colour: '#E3CC57',
    tooltip: 'notify.<대상>을 드롭다운에서 선택. message는 필수, title은 선택(값 블록 연결).',
    helpUrl: '',
  },
  {
    type: 'action_message',
    message0: 'message',
    message1: '%1',
    args1: [ { type: 'input_statement', name: 'MESSAGE_BLOCKS', check: 'HA_NOTIFY' }, ],
    previousStatement: 'HA_NOTIFY',
    nextStatement: 'HA_NOTIFY',
    colour: '#E3CC57',
    tooltip: 'message 입력',
    helpUrl: '',
  },
  {
    type: 'action_notify_message_text',
    message0: 'text %1',
    args0: [ { type: 'field_input', name: 'TEXT', text: 'input message', spellcheck: true }, ],
    previousStatement: 'HA_NOTIFY',
    nextStatement: 'HA_NOTIFY',
    colour: '#E3CC57',
    tooltip: '알림 본문을 순수 텍스트로 지정합니다.',
    helpUrl: '',
  },
  {
    type: 'action_notify_message_template',
    message0: 'template %1',
    args0: [ { type: 'field_dropdown', name: 'TEMPLATE_KIND', options: NOTIFY_TEMPLATE_KINDS }, ],
    previousStatement: 'HA_NOTIFY',
    nextStatement: 'HA_NOTIFY',
    colour: '#E3CC57',
    tooltip: '미리 정의된 템플릿 값(트리거/시간/사용자)을 message에 삽입합니다.',
    helpUrl: '',
  },
]);
