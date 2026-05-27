import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';

function getSensorDropdownOptions() {
  const sensors = dummyEntities.filter(
    e => String(e.entity_id).startsWith('sensor.') && !Number.isNaN(Number(e.state))
  );
  if (sensors.length === 0) return [['(no numeric sensors)', '']];
  return sensors.map(e => [
    e.attributes?.friendly_name || e.entity_id,
    e.entity_id
  ]);
}

export const eventNumericSensorBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    {
      "type": "ha_event_numeric_state_sensor",
      "message0": "sensor %1 above %2 below %3 %4",
      "args0": [
        { "type": "field_dropdown", "name": "ENTITY", "options": getSensorDropdownOptions },
        { "type": "field_number", "name": "ABOVE", "value": 0, "precision": 0.1 },
        { "type": "field_number", "name": "BELOW", "value": 0, "precision": 0.1 },
        { "type": "input_value", "name": "FOR", "check": "DURATION" }
      ],
      "previousStatement": "HA_EVENT",
      "nextStatement": "HA_EVENT",
      "colour": 180,
      "tooltip": "Triggers when the selected sensor crosses the above/below thresholds. You can use one threshold or both to define a range.",
    }
  ]);
