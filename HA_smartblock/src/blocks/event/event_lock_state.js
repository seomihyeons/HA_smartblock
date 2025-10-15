// src/blocks/event_lock_state.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities';
import { makeToStateOptionsFor, registerFromToSyncExtension } from '../../utils/block_state_options';

//registerFromToSyncExtension(); // 한 번만
const getToStateOptions = makeToStateOptionsFor(['unlocked', 'locked']);

function getLockDropdownOptions() {
  const locks = dummyEntities.filter(e => String(e.entity_id).startsWith('lock.'));
  if (locks.length === 0) return [['(no locks)', '']];
  return locks.map(e => [
    e.attributes?.friendly_name || e.entity_id,
    e.entity_id
  ]);
}

export const eventLockStateBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    {
      "type": "ha_event_lock_state",
      "message0": "lock %1 from %2 to %3 %4",
      "args0": [
        { "type": "field_dropdown", "name": "ENTITY", "options": getLockDropdownOptions },
        { "type": "field_dropdown", "name": "FROM", "options": [ ["locked", "locked"], ["unlocked", "unlocked"], ["(any)", ""] ] },
        { "type": "field_dropdown", "name": "TO", "options": getToStateOptions},
        { "type": "input_value", "name": "FOR" }
      ],
      "previousStatement": "HA_EVENT",
      "nextStatement": "HA_EVENT",
      "colour": 180,
      "tooltip": "선택한 lock의 상태 변화(locked/unlocked)를 감지하는 상태 트리거입니다.",
      "helpUrl": "https://www.home-assistant.io/docs/automation/trigger/#state-trigger"
    }
  ]);
