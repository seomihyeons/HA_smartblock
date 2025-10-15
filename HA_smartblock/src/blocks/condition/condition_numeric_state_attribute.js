// src/blocks/condition/condition_numeric_state_attribute.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities.js';

function getEntitiesWithNumericAttributes() {
  return dummyEntities.filter(entity => {
    const attrs = entity.attributes || {};
    return Object.values(attrs).some(v => !isNaN(parseFloat(v)));
  });
}

function getEntityOptions() {
  const list = getEntitiesWithNumericAttributes();
  return list.length
    ? list.map(e => [e.attributes?.friendly_name || e.entity_id, e.entity_id])
    : [['(No numeric attribute entities found)', '']];
}

function getAttributeOptions() {
  const block = this.getSourceBlock?.();
  const entityId = block?.getFieldValue('ENTITY_ID');
  const entity = dummyEntities.find(e => e.entity_id === entityId);
  if (!entity) return [['(Select entity first)', '']];
  const attrs = entity.attributes || {};
  const numericAttrs = Object.keys(attrs).filter(k => !isNaN(parseFloat(attrs[k])));
  return numericAttrs.length
    ? numericAttrs.map(a => [a, a])
    : [['(No numeric attributes)', '']];
}

export const conditionNumericStateAttributeBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    {
      "type": "condition_numeric_state_attribute",
      "message0": "numeric attribute of %1 %2 attribute %3 above %4 below %5",
      "args0": [
        { "type": "field_dropdown", "name": "ENTITY_ID", "options": getEntityOptions },
        { "type": "input_dummy" },
        { "type": "field_dropdown", "name": "ATTRIBUTE", "options": getAttributeOptions },
        { "type": "field_number", "name": "ABOVE", "value": 0, "min": 0 },
        { "type": "field_number", "name": "BELOW", "value": 0, "min": 0 }
      ],
      "previousStatement": "HA_CONDITION",
      "nextStatement": "HA_CONDITION",
      "colour": "#AECA3E",
      "tooltip": "엔티티의 숫자형 속성(attribute)을 기준으로 numeric_state 비교를 수행합니다.",
      "helpUrl": ""
    }
  ]);
