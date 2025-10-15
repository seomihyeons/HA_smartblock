// src/blocks/event_binary_sensor_state.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities';
import { makeToStateOptionsFor, registerFromToSyncExtension } from '../../utils/block_state_options';

registerFromToSyncExtension();
const getToStateOptions = makeToStateOptionsFor(['off', 'on']);

function getBinarySensorDropdownOptions() {
  const bins = dummyEntities.filter(e => String(e.entity_id).startsWith('binary_sensor.'));
  if (bins.length === 0) return [['(no binary sensors)', '']];
  return bins.map(e => [ e.attributes ?. friendly_name || e.entity_id , e.entity_id ]);
}

export const eventBinarySensorStateBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    {
      "type": "ha_event_binary_state",
      "message0": "binary sensor %1 from %2 to %3 %4",
      "args0": [
        { "type": "field_dropdown", "name": "ENTITY", "options": getBinarySensorDropdownOptions },
        { "type": "field_dropdown", "name": "FROM", "options": [ ["on", "on"], ["off", "off"], ["(any)", ""] ] },
        { "type": "field_dropdown", "name": "TO", "options": getToStateOptions  },
        { "type": "input_value", "name": "FOR" } 
      ],
      "previousStatement": "HA_EVENT",
      "nextStatement": "HA_EVENT",
      "colour": 180,
      "tooltip": "선택한 binary_sensor의 상태 변화(on/off)를 감지하는 상태 트리거입니다.",
      "helpUrl": ""
    }
  ]);
