import * as Blockly from 'blockly';
import { getStudyPersonOptions, getStudyZoneOptions } from '../../data/options.js';

export const conditionZoneBlocks = Blockly.common.createBlockDefinitionsFromJsonArray([
  {
    type: 'condition_zone_membership',
    message0: 'zone %1 %2 %3',
    args0: [
      { type: 'field_dropdown', name: 'USER', options: getStudyPersonOptions },
      {
        type: 'field_dropdown',
        name: 'MEMBERSHIP',
        options: [
          ['in', 'zone.in_zone'],
          ['not in', 'zone.not_in_zone'],
        ],
      },
      { type: 'field_dropdown', name: 'ZONE', options: getStudyZoneOptions },
    ],
    previousStatement: 'HA_CONDITION',
    nextStatement: 'HA_CONDITION',
    colour: '#AECA3E',
    tooltip: 'Checks whether the study user is in or outside the selected zone.',
    helpUrl: '',
  },
]);
