// src/blocks/event/event_sun_state.js
import * as Blockly from 'blockly';

export const eventSunStateBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    {
      type: 'ha_event_sun_state',
      message0: 'Sun goes from %1 to %2 %3',
      args0: [
        { type: 'field_dropdown', name: 'FROM', options: [ ['above horizon', 'above_horizon'], ['below horizon', 'below_horizon'], ['(any)', ''], ], },
        { type: 'field_dropdown', name: 'TO', options: [ ['above horizon', 'above_horizon'], ['below horizon', 'below_horizon'], ['(any)', ''] ], },
        { type: 'input_value', name: 'FOR', check: 'DURATION' },
      ],
      previousStatement: 'HA_EVENT',
      nextStatement: 'HA_EVENT',
      colour: 180,
      tooltip: 'Triggers when sun.sun changes between above_horizon and below_horizon.',
    },
  ]);
