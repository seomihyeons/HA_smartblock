// src/blocks/condition/condition_numeric_state_entity.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities.js';

// 숫자형 엔티티만 필터링
function getNumericEntities() {
  return dummyEntities
    .filter(e => {
      const v = parseFloat(e.state);
      return !isNaN(v); // state가 숫자로 변환 가능한 엔티티만
    })
    .map(e => [e.attributes?.friendly_name || e.entity_id, e.entity_id]);
}

export const conditionNumericStateEntityBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    {
      "type": "condition_numeric_state_entity",
      "message0": "numeric state of %1 %2 above %3 below %4",
      "args0": [
        { "type": "field_dropdown", "name": "ENTITY_ID", "options": getNumericEntities },
        { "type": "input_dummy" },
        { "type": "field_number", "name": "ABOVE", "value": 0, "min": 0 },
        { "type": "field_number", "name": "BELOW", "value": 0, "min": 0 }
      ],
      "previousStatement": "HA_CONDITION",
      "nextStatement": "HA_CONDITION",
      "colour": "#AECA3E",
      "tooltip": "엔티티의 숫자 상태를 기준으로 비교합니다 (numeric_state).",
      "helpUrl": ""
    }
  ]);
