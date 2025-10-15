// src/blocks/action/action_entity.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities.js';

const domains = ['light', 'switch', 'lock', 'media_player', 'climate'];

const actionOptions = {
  light: [['on', 'turn_on'], ['off', 'turn_off']],
  switch: [['on', 'turn_on'], ['off', 'turn_off']],
  lock: [['lock', 'lock'], ['unlock', 'unlock']],
  media_player: [
    ['on', 'turn_on'],
    ['off', 'turn_off'],
    ['media_play', 'media_play'],
    ['media_pause', 'media_pause']
  ],
  climate: [['on', 'turn_on'], ['off', 'turn_off'], ['set_temperature', 'set_temperature']]
};

function getEntityOptions(domain) {
  const filtered = dummyEntities.filter(e => e.entity_id.startsWith(`${domain}.`));
  if (!filtered.length) return [['(No entities)', '']];
  return filtered.map(e => [e.attributes?.friendly_name || e.entity_id, e.entity_id]);
}

export const actionEntityBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray(
    domains.map(domain => ({
      type: `action_${domain}`,
      message0: `${domain} %1 to %2`,
      args0: [
        { type: 'field_dropdown', name: 'ENTITY_ID', options: () => getEntityOptions(domain) },
        { type: 'field_dropdown', name: 'ACTION', options: actionOptions[domain] },
      ],
      previousStatement: 'HA_ACTION',
      nextStatement: 'HA_ACTION',
      colour: '#E3CC57',
      tooltip: `${domain} 엔티티에 대한 액션을 실행합니다.`,
      helpUrl: ''
    }))
  );
