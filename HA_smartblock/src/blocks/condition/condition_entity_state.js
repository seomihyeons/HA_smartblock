import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';
import { STATE_DOMAINS, getStates } from '../../data/options.js';

function getEntitiesByDomain(domain) {
  const filtered = dummyEntities.filter(e => e.entity_id.startsWith(`${domain}.`));
  if (!filtered.length) return [['(No entities)', '']];
  return filtered.map(e => [e.attributes?.friendly_name || e.entity_id, e.entity_id]);
}

export const conditionStateBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray(
    STATE_DOMAINS.map(domain => ({
      type: `condition_state_${domain}`,
      message0: `${domain} %1 is %2`,
      args0: [
        { type: 'field_dropdown', name: 'ENTITY_ID', options: () => getEntitiesByDomain(domain) },
        { type: 'field_dropdown', name: 'STATE', options: () => getStates(domain) },
      ],
      previousStatement: 'HA_CONDITION',
      nextStatement: 'HA_CONDITION',
      colour: '#AECA3E',
      tooltip: `${domain} 엔티티의 상태를 검사합니다.`,
      helpUrl: '',
    }))
  );
