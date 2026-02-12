// src/blocks/action/action_group.js
import * as Blockly from 'blockly';
import {
  GROUP_ACTION_DOMAINS,
  getGroupEntityOptions,
  getGroupServiceOptionsByDomain,
} from '../../data/options.js';

Blockly.Extensions.register('action_group_dynamic_service', function () {
  const domainField = this.getField('DOMAIN');
  const serviceField = this.getField('SERVICE');
  if (!domainField || !serviceField) return;

  const updateServiceOptions = (domain) => {
    const opts = getGroupServiceOptionsByDomain(domain);
    // Blockly dropdown internal generator
    serviceField.menuGenerator_ = opts;

    const validValues = opts.map(o => o[1]);
    if (!validValues.includes(serviceField.getValue())) {
      if (opts[0]) serviceField.setValue(opts[0][1]);
    }
  };

  const resetChildEntities = () => {
    const input = this.getInput('ENTITIES');
    const firstBlock = input?.connection?.targetBlock();

    let b = firstBlock;
    while (b) {
      const f = b.getField('ENTITY_ID');
      if (f) {
        const opts = typeof f.getOptions === 'function' ? f.getOptions() : [];
        const fallback = opts.length ? opts[0][1] : '';
        f.setValue(fallback);
      }
      b = b.getNextBlock();
    }
  };

  const syncChildService = () => {
    const input = this.getInput('ENTITIES');
    const firstBlock = input?.connection?.targetBlock();
    const service = this.getFieldValue('SERVICE') || '';

    let b = firstBlock;
    while (b) {
      const f = b.getField('ACTION');
      if (f && service) {
        const opts = typeof f.getOptions === 'function' ? f.getOptions().map((o) => o[1]) : [];
        if (!opts.length || opts.includes(service)) {
          f.setValue(service);
        }
      }
      b = b.getNextBlock();
    }
  };

  const initialDomain = domainField.getValue() || 'cover';
  updateServiceOptions(initialDomain);
  syncChildService();

  domainField.setValidator((newVal) => {
    const domain = newVal || 'cover';
    updateServiceOptions(domain);
    resetChildEntities();
    syncChildService();
    return newVal;
  });

  serviceField.setValidator((newVal) => {
    syncChildService();
    return newVal;
  });
});

export const actionGroupBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    {
      type: 'action_group_entities',
      message0: 'group %1 to %2',
      args0: [
        { type: 'field_dropdown', name: 'DOMAIN', options: GROUP_ACTION_DOMAINS },
        // 초기 options는 아무거나 들어가도 되고, extension이 DOMAIN에 맞게 갱신해줌
        { type: 'field_dropdown', name: 'SERVICE', options: [['-', '']] },
      ],
      message1: '%1',
      args1: [
        { type: 'input_statement', name: 'ENTITIES', check: 'HA_ACTION' },
      ],
      previousStatement: 'HA_ACTION',
      nextStatement: 'HA_ACTION',
      colour: '#E3CC57',
      tooltip: '여러 엔티티에 동일한 액션을 한 번에 실행합니다.',
      helpUrl: '',
      mutator: 'ha_action_optional_data',
      extensions: ['action_group_dynamic_service'],
    },
    {
      type: 'action_group_entity_item',
      message0: 'entity %1',
      args0: [
        { type: 'field_dropdown', name: 'ENTITY_ID', options: getGroupEntityOptions },
      ],
      previousStatement: 'HA_ACTION',
      nextStatement: 'HA_ACTION',
      colour: '#E3CC57',
      tooltip: '그룹 액션이 적용될 엔티티를 선택합니다.',
      helpUrl: '',
    },
  ]);
