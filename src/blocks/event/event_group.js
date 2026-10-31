import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';
import { STATE_DOMAINS, getStates } from '../../data/options.js';
import {
    createVisibleThresholdNumber,
    getThresholdMode,
    SegmentedThresholdModeField,
} from '../utils/segmented_numeric_threshold.js';

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
            tooltip: 'Applies the same state trigger (from/to/for) to multiple entities.',
            helpUrl: '',
            extensions: ['event_group_dynamic_state', 'event_group_optional_id'],
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
            tooltip: 'Selects an entity included in the group trigger.',
            helpUrl: '',
        },
    ]);

Blockly.Blocks.event_group_numeric_entities = {
    init() {
        // Keep the public field contract intact for generation, import, and
        // localStorage data created by the earlier checkbox-based UI.  This
        // hidden input must precede the visible rows: if it follows the
        // statement input, Blockly uses it as the final row and renders the
        // statement-input bottom edge too thin.
        this.appendDummyInput('LEGACY_THRESHOLD_FIELDS')
            .appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_ABOVE')
            .appendField(new Blockly.FieldNumber(0, null, null, 0.1), 'ABOVE')
            .appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_BELOW')
            .appendField(new Blockly.FieldNumber(30, null, null, 0.1), 'BELOW')
            .setVisible(false);

        // The header uses FOR as the single value input, matching the compact
        // right-edge connection treatment of ordinary Event blocks.
        this.appendValueInput('FOR')
            .appendField('group sensor')
            .appendField(new SegmentedThresholdModeField({
                containerFill: '#D8EBEB',
                unselectedText: '#54777A',
                ariaPrefix: 'Group numeric trigger threshold',
            }), 'THRESHOLD_MODE_UI')
            .appendField('id', 'ID_LABEL')
            .appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_ID')
            .appendField(new Blockly.FieldTextInput(''), 'ID');

        this.appendStatementInput('ENTITIES')
            .setCheck(['HA_EVENT_GROUP_ITEM', 'HA_EVENT']);

        this.setInputsInline(false);
        this.setPreviousStatement(true, 'HA_EVENT');
        this.setNextStatement(true, 'HA_EVENT');
        this.setColour(180);
        this.setTooltip('Applies the same numeric_state trigger to multiple sensor entities.');
        this.setHelpUrl('');

        Blockly.Extensions.apply('event_group_optional_id', this, false);
        this.updateShape_();
        this.setOnChange(() => {
            if (!this.isUpdatingThresholdMode_) this.updateShape_();
        });
    },

    clearThresholdUi_() {
        const input = this.getInput('FOR');
        ['THRESHOLD_PRIMARY', 'THRESHOLD_AND', 'THRESHOLD_SECONDARY']
            .forEach((fieldName) => input?.removeField(fieldName, true));
    },

    rebuildThresholdUi_(mode) {
        this.clearThresholdUi_();
        if (mode === 'NONE') return;
        const input = this.getInput('FOR');
        let index = input.fieldRow.findIndex((field) => field.name === 'ID_LABEL');
        if (index < 0) index = input.fieldRow.length;
        index = input.insertFieldAt(index, createVisibleThresholdNumber('PRIMARY'), 'THRESHOLD_PRIMARY');
        if (mode === 'BETWEEN') {
            index = input.insertFieldAt(index, 'and', 'THRESHOLD_AND');
            input.insertFieldAt(index, createVisibleThresholdNumber('SECONDARY'), 'THRESHOLD_SECONDARY');
        }
    },

    syncVisibleThresholdValues_(mode) {
        if (this.isEditingThresholdVisual_) return;
        this.isSyncingThresholdVisuals_ = true;
        try {
            const above = this.getField('ABOVE')?.getValue();
            const below = this.getField('BELOW')?.getValue();
            this.getField('THRESHOLD_PRIMARY')?.setValue(mode === 'BELOW' ? below : above);
            this.getField('THRESHOLD_SECONDARY')?.setValue(below);
        } finally {
            this.isSyncingThresholdVisuals_ = false;
        }
    },

    updateShape_() {
        const mode = getThresholdMode(this);
        if (this.thresholdUiMode_ !== mode) {
            this.rebuildThresholdUi_(mode);
            this.thresholdUiMode_ = mode;
        }
        this.syncVisibleThresholdValues_(mode);
        this.getField('THRESHOLD_MODE_UI')?.syncFromBlock_?.();

        const above = Number(this.getFieldValue('ABOVE'));
        const below = Number(this.getFieldValue('BELOW'));
        if (mode === 'BETWEEN' && Number.isFinite(above) && Number.isFinite(below) && below <= above) {
            this.setWarningText('For Between, the below value must be greater than the above value.', 'group-numeric-range');
        } else {
            this.setWarningText(null, 'group-numeric-range');
        }
        if (this.rendered) this.render();
    },
};
