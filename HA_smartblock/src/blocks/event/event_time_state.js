// src/blocks/event_time_state.js
import * as Blockly from 'blockly';

export const eventTimeStateBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    { "type": "ha_event_time_state", "message0": "at %1 : %2 %3 %4",
      "args0": [
        { "type": "field_number", "name": "HOUR", "value": 8, "min": 1, "max": 12, "precision": 1 },
        { "type": "field_number", "name": "MIN", "value": 0, "min": 0, "max": 59, "precision": 1 },
        { "type": "field_dropdown", "name": "PERIOD", "options": [ ["AM", "AM"], ["PM", "PM"] ] }, 
        { "type": "input_value", "name": "EXTRA" } ],
      "previousStatement": "HA_EVENT",
      "nextStatement": "HA_EVENT",
      "inputsInline": false,
      "colour": 180,
      "tooltip": "지정한 시각에 트리거됩니다. (오른쪽 슬롯에 주/월 제약 블럭을 연결해서 확장 가능)",
      "helpUrl": ""
    }
  ]);