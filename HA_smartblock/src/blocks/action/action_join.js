import * as Blockly from 'blockly';
import { ACTION_DOMAINS, getDomainEntityOptionsWithPlaceholder } from '../../data/options.js';

const JOIN_DOMAINS = (ACTION_DOMAINS || []).map((d) => [d, d]);

Blockly.Extensions.register('action_join_dynamic_domain', function () {
  const domainField = this.getField('DOMAIN');
  const entityField = this.getField('ENTITY_ID');
  if (!domainField || !entityField) return;

  const syncByDomain = () => {
    const domain = domainField.getValue() || (JOIN_DOMAINS[0]?.[1] || 'media_player');
    const opts = getDomainEntityOptionsWithPlaceholder(domain);
    entityField.menuGenerator_ = opts;

    const validValues = opts.map((o) => o[1]);
    if (!validValues.includes(entityField.getValue())) {
      if (opts[0]) entityField.setValue(opts[0][1]);
    }

    const membersInput = this.getInput('MEMBERS');
    if (membersInput?.setCheck) {
      // Keep members connectable with standard action blocks.
      // Domain filtering is handled by mapper/generator (action_<domain> only).
      membersInput.setCheck('HA_ACTION');
    }
  };

  syncByDomain();
  domainField.setValidator((newVal) => {
    setTimeout(syncByDomain, 0);
    return newVal;
  });
});

export const actionJoinBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    {
      type: 'action_join',
      message0: 'join %1 entity %2',
      args0: [
        { type: 'field_dropdown', name: 'DOMAIN', options: JOIN_DOMAINS.length ? JOIN_DOMAINS : [['media_player', 'media_player']] },
        { type: 'field_dropdown', name: 'ENTITY_ID', options: () => getDomainEntityOptionsWithPlaceholder('media_player') },
      ],
      message1: 'member %1',
      args1: [
        { type: 'input_statement', name: 'MEMBERS', check: 'HA_ACTION' },
      ],
      previousStatement: 'HA_ACTION',
      nextStatement: 'HA_ACTION',
      colour: '#E3CC57',
      tooltip: '도메인.join 액션을 구성합니다. member에는 같은 도메인 액션 블록을 연결하세요.',
      helpUrl: '',
      extensions: ['action_join_dynamic_domain'],
    },
  ]);
