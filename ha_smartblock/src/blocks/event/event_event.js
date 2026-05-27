// src/blocks/event/event_event.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';
import { ACTION_DOMAINS, getActions } from '../../data/options.js';

function getParentBlock(block) {
  if (!block) return null;
  return block.getSurroundParent?.() || block.getParent?.() || null;
}

function findCallServiceParent(block) {
  let cur = block;
  while (cur) {
    if (cur.type === 'ha_event_event_data_call_service') return cur;
    const next = getParentBlock(cur);
    if (!next || next === cur) break;
    cur = next;
  }
  return null;
}

function getAllServiceDomains() {
  const domains = new Set(ACTION_DOMAINS || []);
  for (const e of (dummyEntities || [])) {
    const id = String(e?.entity_id || '');
    if (!id.includes('.')) continue;
    domains.add(id.split('.', 1)[0]);
  }
  const sorted = Array.from(domains).filter(Boolean).sort((a, b) => a.localeCompare(b));
  if (!sorted.length) return [['(No domains)', '']];
  return sorted.map((d) => [d, d]);
}

function resolveDomainFromCallServiceBlock(block) {
  if (!block) return '';
  const mode = String(block.getFieldValue('DOMAIN_MODE') || 'DROPDOWN');
  if (mode === 'TEXT') {
    return String(block.getFieldValue('DOMAIN_TEXT') || '').trim();
  }
  return String(block.getFieldValue('DOMAIN') || '').trim();
}

function getServiceOptionsForDomain(domain) {
  const d = String(domain || '').trim();
  if (!d) return [['(Select domain first)', '']];
  const opts = getActions(d) || [];
  if (!opts.length || (opts.length === 1 && opts[0]?.[1] === '')) {
    return [['(No services)', '']];
  }
  return opts;
}

function getCallServiceServiceOptions() {
  const block = this.getSourceBlock?.();
  const domain = resolveDomainFromCallServiceBlock(block);
  return getServiceOptionsForDomain(domain);
}

function getServiceDataEntityOptions() {
  const block = this.getSourceBlock?.();
  const parent = findCallServiceParent(block);
  const domain = resolveDomainFromCallServiceBlock(parent);
  if (!domain) return [['(Select domain first)', '']];

  const rows = (dummyEntities || []).filter((e) => {
    const id = String(e?.entity_id || '');
    return id.startsWith(`${domain}.`);
  });
  if (!rows.length) return [['(No entities)', '']];
  return rows.map((e) => [e.attributes?.friendly_name || e.entity_id, e.entity_id]);
}

Blockly.Blocks['ha_event_event'] = {
  hasEventData_: false,
  hasContext_: false,
  isSyncingEventDataField_: false,
  isSyncingContextField_: false,

  saveExtraState() {
    return {
      hasEventData: this.hasEventData_,
      hasContext: this.hasContext_,
    };
  },

  loadExtraState(state) {
    this.hasEventData_ = !!state?.hasEventData;
    this.hasContext_ = !!state?.hasContext;
    this.updateShape_();
  },

  init() {
    this.appendDummyInput('HEAD')
      .appendField('event')
      .appendField(new Blockly.FieldTextInput('type'), 'EVENT_TYPE')
      .appendField('data')
      .appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_EVENT_DATA')
      .appendField('context')
      .appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_CONTEXT');

    this.setPreviousStatement(true, 'HA_EVENT');
    this.setNextStatement(true, 'HA_EVENT');
    this.setColour(180);
    this.setTooltip('Home Assistant event trigger');
    this.setHelpUrl('');

    this.getField('USE_EVENT_DATA')?.setValidator((newVal) => {
      if (this.isSyncingEventDataField_) return newVal;
      this.hasEventData_ = newVal === 'TRUE';
      this.updateShape_();
      return newVal;
    });

    this.getField('USE_CONTEXT')?.setValidator((newVal) => {
      if (this.isSyncingContextField_) return newVal;
      this.hasContext_ = newVal === 'TRUE';
      this.updateShape_();
      return newVal;
    });

    this.updateShape_();
  },

  updateShape_() {
    const eventDataName = 'EVENT_DATA';
    const contextName = 'CONTEXT_DATA';
    const hasEventDataInput = !!this.getInput(eventDataName);
    const hasContextInput = !!this.getInput(contextName);

    if (this.hasEventData_ && !hasEventDataInput) {
      this.appendStatementInput(eventDataName)
        .setCheck('HA_EVENT_DATA')
        .appendField('data');
    } else if (!this.hasEventData_ && hasEventDataInput) {
      this.removeInput(eventDataName);
    }

    if (this.hasContext_ && !hasContextInput) {
      this.appendStatementInput(contextName)
        .setCheck('HA_EVENT_CONTEXT')
        .appendField('context');
    } else if (!this.hasContext_ && hasContextInput) {
      this.removeInput(contextName);
    }

    const expectedEventData = this.hasEventData_ ? 'TRUE' : 'FALSE';
    if (this.getField('USE_EVENT_DATA') && this.getFieldValue('USE_EVENT_DATA') !== expectedEventData) {
      this.isSyncingEventDataField_ = true;
      this.setFieldValue(expectedEventData, 'USE_EVENT_DATA');
      this.isSyncingEventDataField_ = false;
    }

    const expectedContext = this.hasContext_ ? 'TRUE' : 'FALSE';
    if (this.getField('USE_CONTEXT') && this.getFieldValue('USE_CONTEXT') !== expectedContext) {
      this.isSyncingContextField_ = true;
      this.setFieldValue(expectedContext, 'USE_CONTEXT');
      this.isSyncingContextField_ = false;
    }

    if (this.rendered) this.render();
  },

  customContextMenu(options) {
    options.push({
      text: this.hasEventData_ ? 'Hide data' : 'Show data',
      enabled: true,
      callback: () => {
        this.hasEventData_ = !this.hasEventData_;
        this.updateShape_();
        if (this.rendered) this.render();
      },
    });

    options.push({
      text: this.hasContext_ ? 'Hide context' : 'Show context',
      enabled: true,
      callback: () => {
        this.hasContext_ = !this.hasContext_;
        this.updateShape_();
        if (this.rendered) this.render();
      },
    });
  },
};

Blockly.Blocks['ha_event_event_data_call_service'] = {
  init() {
    this.appendDummyInput('ROW')
      .appendField('domain')
      .appendField(new Blockly.FieldDropdown([['dropdown', 'DROPDOWN'], ['text', 'TEXT']]), 'DOMAIN_MODE')
      .appendField(new Blockly.FieldDropdown(getAllServiceDomains), 'DOMAIN')
      .appendField(new Blockly.FieldTextInput('cover'), 'DOMAIN_TEXT')
      .appendField('service')
      .appendField(new Blockly.FieldDropdown([['dropdown', 'DROPDOWN'], ['text', 'TEXT']]), 'SERVICE_MODE')
      .appendField(new Blockly.FieldDropdown(getCallServiceServiceOptions), 'SERVICE')
      .appendField(new Blockly.FieldTextInput('close_cover'), 'SERVICE_TEXT')
      .appendField('call id')
      .appendField(new Blockly.FieldTextInput(''), 'SERVICE_CALL_ID');

    this.appendStatementInput('SERVICE_DATA')
      .setCheck('HA_EVENT_SERVICE_DATA')
      .appendField('data');

    this.setPreviousStatement(true, 'HA_EVENT_DATA');
    this.setNextStatement(true, 'HA_EVENT_DATA');
    this.setColour(180);
    this.setTooltip('call_service event_data');
    this.setHelpUrl('');
    this.setInputsInline(true);

    this.updateShape_();
    this.normalizeServiceSelection_();

    const refresh = () => {
      this.updateShape_();
      this.normalizeServiceSelection_();
    };

    this.getField('DOMAIN_MODE')?.setValidator((newVal) => {
      setTimeout(refresh, 0);
      return newVal;
    });
    this.getField('SERVICE_MODE')?.setValidator((newVal) => {
      setTimeout(refresh, 0);
      return newVal;
    });
    this.getField('DOMAIN')?.setValidator((newVal) => {
      setTimeout(refresh, 0);
      return newVal;
    });
    this.getField('DOMAIN_TEXT')?.setValidator((newVal) => {
      setTimeout(refresh, 0);
      return newVal;
    });
  },

  normalizeServiceSelection_() {
    const serviceMode = String(this.getFieldValue('SERVICE_MODE') || 'DROPDOWN');
    if (serviceMode !== 'DROPDOWN') return;
    const serviceField = this.getField('SERVICE');
    if (!serviceField || typeof serviceField.getOptions !== 'function') return;
    const opts = serviceField.getOptions().map((o) => String(o?.[1] ?? ''));
    const cur = String(serviceField.getValue?.() ?? '');
    if (!opts.includes(cur)) {
      serviceField.setValue(opts[0] ?? '');
    }
  },

  updateShape_() {
    const domainMode = String(this.getFieldValue('DOMAIN_MODE') || 'DROPDOWN');
    const serviceMode = String(this.getFieldValue('SERVICE_MODE') || 'DROPDOWN');
    this.getField('DOMAIN')?.setVisible(domainMode === 'DROPDOWN');
    this.getField('DOMAIN_TEXT')?.setVisible(domainMode === 'TEXT');
    this.getField('SERVICE')?.setVisible(serviceMode === 'DROPDOWN');
    this.getField('SERVICE_TEXT')?.setVisible(serviceMode === 'TEXT');
    if (this.rendered) this.render();
  },
};

Blockly.Blocks['ha_event_service_data_entity_id'] = {
  init() {
    this.appendDummyInput('ROW')
      .appendField('entity_id')
      .appendField(new Blockly.FieldDropdown([['dropdown', 'DROPDOWN'], ['text', 'TEXT']]), 'ENTITY_MODE')
      .appendField(new Blockly.FieldDropdown(getServiceDataEntityOptions), 'ENTITY_ID')
      .appendField(new Blockly.FieldTextInput('cover.garage_door'), 'VALUE');

    this.setPreviousStatement(true, 'HA_EVENT_SERVICE_DATA');
    this.setNextStatement(true, 'HA_EVENT_SERVICE_DATA');
    this.setColour(180);
    this.setTooltip('service_data entity_id');
    this.setHelpUrl('');
    this.setInputsInline(true);

    this.updateShape_();
    this.normalizeEntitySelection_();

    const refresh = () => {
      this.updateShape_();
      this.normalizeEntitySelection_();
    };
    this.getField('ENTITY_MODE')?.setValidator((newVal) => {
      setTimeout(refresh, 0);
      return newVal;
    });
  },

  normalizeEntitySelection_() {
    const mode = String(this.getFieldValue('ENTITY_MODE') || 'DROPDOWN');
    if (mode !== 'DROPDOWN') return;
    const field = this.getField('ENTITY_ID');
    if (!field || typeof field.getOptions !== 'function') return;
    const opts = field.getOptions().map((o) => String(o?.[1] ?? ''));
    const cur = String(field.getValue?.() ?? '');
    if (!opts.includes(cur)) {
      field.setValue(opts[0] ?? '');
    }
  },

  updateShape_() {
    const mode = String(this.getFieldValue('ENTITY_MODE') || 'DROPDOWN');
    this.getField('ENTITY_ID')?.setVisible(mode === 'DROPDOWN');
    this.getField('VALUE')?.setVisible(mode === 'TEXT');
    if (this.rendered) this.render();
  },
};

export const eventEventBlocks = Blockly.common.createBlockDefinitionsFromJsonArray([
  {
    type: 'ha_event_kv',
    message0: '%1 : %2',
    args0: [
      { type: 'field_input', name: 'KEY', text: 'key', spellcheck: true },
      { type: 'field_input', name: 'VALUE', text: 'value', spellcheck: true },
    ],
    previousStatement: ['HA_EVENT_DATA', 'HA_EVENT_SERVICE_DATA'],
    nextStatement: ['HA_EVENT_DATA', 'HA_EVENT_SERVICE_DATA'],
    colour: 180,
    tooltip: 'event/service_data key/value',
    helpUrl: '',
  },
  {
    // Legacy compatibility for previously saved workspaces.
    type: 'ha_event_event_data_kv',
    message0: '%1 : %2',
    args0: [
      { type: 'field_input', name: 'KEY', text: 'key', spellcheck: true },
      { type: 'field_input', name: 'VALUE', text: 'value', spellcheck: true },
    ],
    previousStatement: 'HA_EVENT_DATA',
    nextStatement: 'HA_EVENT_DATA',
    colour: 180,
    tooltip: 'event_data key/value',
    helpUrl: '',
  },
  {
    // Legacy compatibility for previously saved workspaces.
    type: 'ha_event_service_data_kv',
    message0: '%1 : %2',
    args0: [
      { type: 'field_input', name: 'KEY', text: 'key', spellcheck: true },
      { type: 'field_input', name: 'VALUE', text: 'value', spellcheck: true },
    ],
    previousStatement: 'HA_EVENT_SERVICE_DATA',
    nextStatement: 'HA_EVENT_SERVICE_DATA',
    colour: 180,
    tooltip: 'service_data key/value',
    helpUrl: '',
  },
  {
    type: 'ha_event_context_kv',
    message0: 'context %1 %2',
    args0: [
      {
        type: 'field_dropdown',
        name: 'CONTEXT_KEY',
        options: [
          ['id', 'id'],
          ['parent_id', 'parent_id'],
          ['user_id', 'user_id'],
        ],
      },
      { type: 'field_input', name: 'VALUE', text: 'value', spellcheck: true },
    ],
    previousStatement: 'HA_EVENT_CONTEXT',
    nextStatement: 'HA_EVENT_CONTEXT',
    colour: 180,
    tooltip: 'context key/value',
    helpUrl: '',
  },
]);
