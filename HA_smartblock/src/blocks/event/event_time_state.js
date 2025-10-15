// src/blocks/event_time_state.js
import * as Blockly from 'blockly';

export function registerEventTimeStateBlock() {
  Blockly.Blocks['ha_event_time_state'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('at')
        .appendField(new Blockly.FieldNumber(8, 1, 12, 1), 'HOUR')
        .appendField(':')
        .appendField(new Blockly.FieldNumber(0, 0, 59, 1), 'MIN')
        .appendField(new Blockly.FieldDropdown([['AM', 'AM'], ['PM', 'PM']]), 'PERIOD');

      this.appendValueInput('EXTRA')
        .setCheck(null)
        .appendField('');

      this.setInputsInline(false);
      this.setPreviousStatement(true, "HA_EVENT");
      this.setNextStatement(true, "HA_EVENT");
      this.setColour(180);
      this.setTooltip('지정한 시각에 트리거됩니다. (오른쪽 슬롯에 주/월 제약 블럭을 연결해서 확장 가능)');
      this.setHelpUrl('');
    }
  };
}
