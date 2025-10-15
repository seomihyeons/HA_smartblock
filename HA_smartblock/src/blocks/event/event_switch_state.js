// src/blocks/event_switch_state.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities';
import { makeToStateOptionsFor, registerFromToSyncExtension } from '../../utils/block_state_options';

//registerFromToSyncExtension(); // 한 번만
const getToStateOptions = makeToStateOptionsFor(['off', 'on']);

function getSwitchDropdownOptions() {
  const switches = dummyEntities.filter(e => String(e.entity_id).startsWith('switch.'));
  if (switches.length === 0) return [['(no switches)', '']];
  return switches.map(e => [
    e.attributes?.friendly_name || e.entity_id,
    e.entity_id
  ]);
}

export const eventSwitchStateBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    {
      "type": "ha_event_switch_state",
      "message0": "switch %1 from %2 to %3 %4",
      "args0": [
        { "type": "field_dropdown", "name": "ENTITY", "options": getSwitchDropdownOptions },
        { "type": "field_dropdown", "name": "FROM", "options": [ ["on", "on"], ["off", "off"], ["(any)", ""] ] },
        { "type": "field_dropdown", "name": "TO", "options": getToStateOptions },
        { "type": "input_value", "name": "FOR" }
        
      ],
      "previousStatement": "HA_EVENT",
      "nextStatement": "HA_EVENT",
      "colour": 180,
      "tooltip": "선택한 switch의 상태(on/off) 변화를 감지하는 상태 트리거입니다.",
      "helpUrl": "https://www.home-assistant.io/docs/automation/trigger/#state-trigger"
    }
  ]);
