// src/blocks/action/action_entity.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';
import { ACTION_DOMAINS, getActions } from '../../data/options.js';

function getEntityOptions(domain) {
  const filtered = dummyEntities.filter(e => e.entity_id.startsWith(`${domain}.`));
  if (!filtered.length) return [['(No entities)', '']];
  return filtered.map(e => [e.attributes?.friendly_name || e.entity_id, e.entity_id]);
}

export const actionEntityBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray(
    ACTION_DOMAINS.map(domain => ({
      type: `action_${domain}`,
      message0: `${domain} %1 to %2`,
      args0: [
        { type: 'field_dropdown', name: 'ENTITY_ID', options: () => getEntityOptions(domain) },
        { type: 'field_dropdown', name: 'ACTION', options: () => getActions(domain) },
      ],
      previousStatement: 'HA_ACTION',
      nextStatement: 'HA_ACTION',
      colour: '#E3CC57',
      tooltip: `${domain} 엔티티에 대한 액션을 실행합니다.`,
      helpUrl: '',
      mutator: 'ha_action_optional_data',
    }))
  );
