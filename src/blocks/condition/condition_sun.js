import * as Blockly from 'blockly';

export const conditionSunBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    {
      type: 'condition_sun',
      message0: 'sun',
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'PARTS', check: 'HA_CONDITION_SUN_PART' }],
      previousStatement: 'HA_CONDITION',
      nextStatement: 'HA_CONDITION',
      colour: '#AECA3E',
      tooltip: 'sun 조건. before/after 중 하나 이상 필요합니다.',
      helpUrl: '',
    },
    {
      type: 'condition_sun_after',
      message0: 'after %1 %2',
      args0: [
        {
          type: 'field_dropdown',
          name: 'EVENT',
          options: [
            ['sunrise', 'sunrise'],
            ['sunset', 'sunset'],
          ],
        },
        { type: 'input_value', name: 'OFFSET', check: 'HA_DURATION' },
      ],
      previousStatement: 'HA_CONDITION_SUN_PART',
      nextStatement: 'HA_CONDITION_SUN_PART',
      colour: '#AECA3E',
      tooltip: 'after sunrise/sunset. 필요하면 offset을 연결하세요.',
      helpUrl: '',
    },
    {
      type: 'condition_sun_before',
      message0: 'before %1 %2',
      args0: [
        {
          type: 'field_dropdown',
          name: 'EVENT',
          options: [
            ['sunrise', 'sunrise'],
            ['sunset', 'sunset'],
          ],
        },
        { type: 'input_value', name: 'OFFSET', check: 'HA_DURATION' },
      ],
      previousStatement: 'HA_CONDITION_SUN_PART',
      nextStatement: 'HA_CONDITION_SUN_PART',
      colour: '#AECA3E',
      tooltip: 'before sunrise/sunset. 필요하면 offset을 연결하세요.',
      helpUrl: '',
    },
    {
      type: 'condition_sun_offset',
      message0: 'offset %1 %2 : %3 : %4',
      args0: [
        {
          type: 'field_dropdown',
          name: 'SIGN',
          options: [
            ['+', '+'],
            ['-', '-'],
          ],
        },
        { type: 'field_number', name: 'H', value: 0, min: 0, max: 23, precision: 1 },
        { type: 'field_number', name: 'M', value: 0, min: 0, max: 60, precision: 1 },
        { type: 'field_number', name: 'S', value: 0, min: 0, max: 60, precision: 1 },
      ],
      output: 'HA_DURATION',
      colour: '#AECA3E',
      tooltip: 'sun 조건용 offset(±HH:MM:SS)',
      helpUrl: '',
    },
  ]);
