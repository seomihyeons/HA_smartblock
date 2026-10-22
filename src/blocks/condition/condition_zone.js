import * as Blockly from 'blockly';
import { getPersonOptions, getZoneOptions } from '../../data/options.js';

export const conditionZoneBlocks = Blockly.common.createBlockDefinitionsFromJsonArray([
  {
    type: 'condition_zone_membership',
    message0: 'zone %1 %2 %3',
    args0: [
      { type: 'field_dropdown', name: 'USER', options: getPersonOptions },
      {
        type: 'field_dropdown',
        name: 'MEMBERSHIP',
        options: [
          ['in', 'zone.in_zone'],
          ['not in', 'zone.not_in_zone'],
        ],
      },
      { type: 'field_dropdown', name: 'ZONE', options: getZoneOptions },
    ],
    previousStatement: 'HA_CONDITION',
    nextStatement: 'HA_CONDITION',
    colour: '#AECA3E',
    tooltip: 'Checks whether the selected person is in or outside the selected zone.',
    helpUrl: '',
  },
]);
