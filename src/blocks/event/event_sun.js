// src/blocks/event/event_sun.js
import * as Blockly from 'blockly';

/**
 * 숫자 입력 필드(두 자리 패딩) 검증용 확장:
 * - H: 0~23
 * - M/S: 0~59
 */
Blockly.Extensions.register('ha_sun_offset_numeric_fields', function () {
  const pad2 = (n) => String(n).padStart(2, '0');

  const setRangeValidator = (field, min, max) => {
    field.setValidator((val) => {
      const v = Number(val);
      if (Number.isNaN(v)) return pad2(0);
      const clamped = Math.max(min, Math.min(max, Math.trunc(v)));
      return pad2(clamped);
    });
    // 초기값도 한번 정규화
    field.setValue(pad2(Number(field.getValue()) || 0));
  };

  const fH = this.getField('H');
  const fM = this.getField('M');
  const fS = this.getField('S');

  if (fH) setRangeValidator(fH, 0, 23);
  if (fM) setRangeValidator(fM, 0, 59);
  if (fS) setRangeValidator(fS, 0, 59);
});

export const haEventSunBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray ([
  { "type": "ha_event_sun", "message0": "Sun %1 %2",
    "args0": [
        { "type": "field_dropdown", "name": "EVENT", "options": [ ["sunrise", "sunrise"], ["sunset",  "sunset"] ] },
        { "type": "input_value", "name": "OFFSET" } ],
    "previousStatement": "HA_EVENT",
    "nextStatement": "HA_EVENT",
    "colour": 180,
    "tooltip": "Sunrise/Sunset 트리거. 필요하면 뒤에 offset(HH:MM:SS)을 연결하세요.",
    "helpUrl": ""
  },
  {
    "type": "ha_event_offset",
    "message0": "offset %1 %2 : %3 : %4",
    "args0": [
      { "type": "field_dropdown", "name": "SIGN", "options": [ ["+", "+"], ["-", "-"] ] },
      { "type": "field_input", "name": "H", "text": "00" },
      { "type": "field_input", "name": "M", "text": "00" },
      { "type": "field_input", "name": "S", "text": "00" }
    ],
    "output": "HA_DURATION",
    "colour": 180,
    "extensions": ["ha_sun_offset_numeric_fields"],
    "tooltip": "오프셋 시간(±HH:MM:SS). +는 이후, -는 이전을 의미합니다.",
    "helpUrl": ""
  }
]);