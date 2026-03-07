import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';
import { STATE_DOMAINS, getStates } from '../../data/options.js';

function withAny(options) {
    const opts = (options || []).filter(([, v]) => v !== undefined && v !== null);
    const existsAny = opts.some(([, v]) => String(v) === '');
    if (existsAny) return opts;
    return [...opts, ['(any)', '']];
}

function getDomainEntities(domain) {
    const rows = (dummyEntities || []).filter((e) => {
        const id = String(e.entity_id || '');
        return id.startsWith(`${domain}.`);
    });
    if (!rows.length) return [['(No entities)', '']];
    return rows.map((e) => [e.attributes?.friendly_name || e.entity_id, e.entity_id]);
}

function getGroupItemEntityOptions() {
    const field = this;
    const block = field?.getSourceBlock?.() || null;
    const parent = block?.getSurroundParent?.() || block?.parentBlock_ || null;
    if (parent?.type === 'event_group_numeric_entities') {
        return getDomainEntities('sensor');
    }
    const domain = parent?.getFieldValue?.('DOMAIN') || 'cover';
    return getDomainEntities(domain);
}

const EVENT_GROUP_DOMAINS = (STATE_DOMAINS || [])
    .filter((d) => d !== 'sun')
    .map((d) => [d, d]);

Blockly.Extensions.register('event_group_dynamic_state', function () {
    const domainField = this.getField('DOMAIN');
    const fromField = this.getField('FROM');
    const toField = this.getField('TO');
    if (!domainField || !fromField || !toField) return;

    const updateStateOptions = (domain) => {
        const opts = withAny(getStates(domain));
        fromField.menuGenerator_ = opts;
        toField.menuGenerator_ = opts;

        const values = opts.map((o) => o[1]);
        if (!values.includes(fromField.getValue())) fromField.setValue(opts[0]?.[1] ?? '');
        if (!values.includes(toField.getValue())) toField.setValue(opts[0]?.[1] ?? '');
    };

    const resetChildren = () => {
        const first = this.getInputTargetBlock('ENTITIES');
        let b = first;
        while (b) {
            const f = b.getField('ENTITY_ID');
            if (f) {
                const opts = typeof f.getOptions === 'function' ? f.getOptions() : [];
                f.setValue(opts[0]?.[1] ?? '');
            }
            b = b.getNextBlock();
        }
    };

    const initialDomain = domainField.getValue() || 'cover';
    updateStateOptions(initialDomain);

    domainField.setValidator((newVal) => {
        const domain = newVal || 'cover';
        updateStateOptions(domain);
        resetChildren();
        return newVal;
    });
});

Blockly.Extensions.register('event_group_optional_id', function () {
    const sync = () => {
        const useId = this.getFieldValue('USE_ID') === 'TRUE';
        const idField = this.getField('ID');
        idField?.setVisible(useId);
        if (!useId && idField) this.setFieldValue('', 'ID');
        if (this.rendered) this.render();
    };

    this.getField('USE_ID')?.setValidator((newVal) => {
        setTimeout(sync, 0);
        return newVal;
    });

    sync();
});

export const eventGroupBlocks =
    Blockly.common.createBlockDefinitionsFromJsonArray([
        {
            type: 'event_group_entities',
            message0: 'group %1 from %2 to %3 id %4 %5 %6',
            args0: [
                { type: 'field_dropdown', name: 'DOMAIN', options: EVENT_GROUP_DOMAINS },
                { type: 'field_dropdown', name: 'FROM', options: [['(any)', '']] },
                { type: 'field_dropdown', name: 'TO', options: [['(any)', '']] },
                { type: 'field_checkbox', name: 'USE_ID', checked: false },
                { type: 'field_input', name: 'ID', text: '' },
                { type: 'input_value', name: 'FOR', check: 'DURATION' },
            ],
      message1: '%1',
      args1: [
        { type: 'input_statement', name: 'ENTITIES', check: ['HA_EVENT_GROUP_ITEM', 'HA_EVENT'] },
      ],
            previousStatement: 'HA_EVENT',
            nextStatement: 'HA_EVENT',
            colour: 180,
            tooltip: '여러 엔티티에 동일한 state 트리거(from/to/for)를 적용합니다.',
            helpUrl: '',
            extensions: ['event_group_dynamic_state', 'event_group_optional_id'],
        },
        {
            type: 'event_group_numeric_entities',
            message0: 'group sensor above %1 %2 below %3 %4 id %5 %6 %7',
            args0: [
                { type: 'field_checkbox', name: 'USE_ABOVE', checked: false },
                { type: 'field_number', name: 'ABOVE', value: 0, precision: 0.1 },
                { type: 'field_checkbox', name: 'USE_BELOW', checked: true },
                { type: 'field_number', name: 'BELOW', value: 30, precision: 0.1 },
                { type: 'field_checkbox', name: 'USE_ID', checked: false },
                { type: 'field_input', name: 'ID', text: '' },
                { type: 'input_value', name: 'FOR', check: 'DURATION' },
            ],
            message1: '%1',
            args1: [
                { type: 'input_statement', name: 'ENTITIES', check: ['HA_EVENT_GROUP_ITEM', 'HA_EVENT'] },
            ],
            previousStatement: 'HA_EVENT',
            nextStatement: 'HA_EVENT',
            colour: 180,
            tooltip: '여러 sensor 엔티티에 동일한 numeric_state(above/below/for)를 적용합니다.',
            helpUrl: '',
            extensions: ['event_group_optional_id'],
        },
        {
            type: 'event_group_entity_item',
            message0: 'entity %1',
            args0: [
                { type: 'field_dropdown', name: 'ENTITY_ID', options: getGroupItemEntityOptions },
            ],
            previousStatement: 'HA_EVENT',
            nextStatement: 'HA_EVENT',
            colour: 180,
            tooltip: '그룹 트리거에 포함할 엔티티를 선택합니다.',
            helpUrl: '',
        },
    ]);
