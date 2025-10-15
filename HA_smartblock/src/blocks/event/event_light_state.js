// src/blocks/event_light_state.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities';
import { makeToStateOptionsFor, registerFromToSyncExtension } from '../../utils/block_state_options';

//registerFromToSyncExtension(); // 한 번만
const getToStateOptions = makeToStateOptionsFor(['off', 'on']);

function getLightDropdownOptions() {
  const lights = dummyEntities.filter(e => String(e.entity_id).startsWith('light.'));
  if (lights.length === 0) {
    return [['(no lights)', '']]; }
  return lights.map(e => [
    e.attributes?.friendly_name || e.entity_id,
    e.entity_id
  ]);
}

export const eventLightStateBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    {
      "type": "ha_event_light_state",
      "message0": "light %1 from %2 to %3 %4",
      "args0": [
        { "type": "field_dropdown", "name": "ENTITY", "options": getLightDropdownOptions },
        { "type": "field_dropdown", "name": "FROM", "options": [ ["on", "on"], ["off", "off"], ["(any)", ""] ] },
        { "type": "field_dropdown", "name": "TO", "options": getToStateOptions },
        { "type": "input_value", "name": "FOR" } 
      ],
      "previousStatement": "HA_EVENT",
      "nextStatement": "HA_EVENT",
      "colour": 180,
      "tooltip": "선택한 light가 특정 상태에서 다른 상태로 바뀔 때 발생하는 상태 트리거입니다."
    }
  ]);