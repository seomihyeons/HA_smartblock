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
      tooltip: 'Sun condition. At least one of before or after is required.',
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
      tooltip: 'After sunrise or sunset. Connect an offset if needed.',
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
      tooltip: 'Before sunrise or sunset. Connect an offset if needed.',
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
      tooltip: 'Offset for sun conditions (±HH:MM:SS).',
      helpUrl: '',
    },
  ]);
