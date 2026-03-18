// src/blocks/event_HA_state.js
import * as Blockly from 'blockly';

export const haEventStateBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    {
      "type": "ha_event_homeassistant", "message0": "Home Assistant to %1",
      "args0": [ { "type": "field_dropdown", "name": "EVENT", "options": [ ["start", "start"], ["shutdown", "shutdown"] ] } ],
      "previousStatement": "HA_EVENT",
      "nextStatement": "HA_EVENT",
      "colour": 180,
      "tooltip": "Home Assistant 코어가 시작(start)하거나 종료(shutdown)할 때 트리거됩니다.",
      "helpUrl": ""
    }
  ]);