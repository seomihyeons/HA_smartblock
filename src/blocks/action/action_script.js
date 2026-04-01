import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';

const MODE_OPTIONS = [
  ['entity', 'entity'],
  ['service', 'service'],
  ['python', 'python'],
];

const SCRIPT_SERVICE_OPTIONS = [
  ['turn_on', 'turn_on'],
  ['turn_off', 'turn_off'],
  ['toggle', 'toggle'],
  ['reload', 'reload'],
];

const CUSTOM_ENTITY_VALUE = '__custom__';

const withBlock = (fn) => function wrapped(...args) {
  return fn(this, ...args);
};

function getScriptEntityOptions() {
  const rows = (dummyEntities || []).filter((e) =>
    String(e.entity_id || '').startsWith('script.')
  );
  const opts = rows.map((e) => [
    e.attributes?.friendly_name || e.entity_id,
    e.entity_id,
  ]);
  if (!opts.length) opts.push(['(No scripts)', '']);
  opts.push(['custom', CUSTOM_ENTITY_VALUE]);
  return opts;
}

function setFieldVisible(block, name, visible) {
  const field = block.getField(name);
  if (!field) return;
  field.setVisible(visible);
}

function ensureScriptInputOrder(block) {
  const hasMain = !!block.getInput('MAIN');
  const hasTarget = !!block.getInput('TARGET');
  const hasData = !!block.getInput('DATA');

  if (hasMain && hasTarget) {
    block.moveInputBefore('MAIN', 'TARGET');
  } else if (hasMain && hasData) {
    block.moveInputBefore('MAIN', 'DATA');
  }

  if (hasTarget && hasData) {
    block.moveInputBefore('TARGET', 'DATA');
  }
}

function setAndKeepDropdownValue(block, fieldName, value) {
  const field = block.getField(fieldName);
  if (!field) return false;
  const want = String(value || '');
  if (!want) return true;

  const options = typeof field.getOptions === 'function' ? field.getOptions() : [];
  const values = options.map((o) => String(o?.[1] ?? ''));
  if (!values.includes(want)) {
    field.menuGenerator_ = [...options, [want, want]];
  }

  block.setFieldValue(want, fieldName);
  return String(field.getValue?.() ?? '') === want;
}

function readScriptCallState(block) {
  const get = (name, fallback = '') => {
    const field = block.getField(name);
    if (!field) return fallback;
    const value = block.getFieldValue(name);
    return value == null ? fallback : String(value);
  };

  return {
    mode: get('MODE', block.mode_ || 'entity'),
    entityId: get('ENTITY_ID', block.entityId_ || ''),
    entityText: get('ENTITY_TEXT', block.entityText_ || 'script.my_script'),
    service: get('SERVICE', block.service_ || 'turn_on'),
    pythonName: get('PYTHON_NAME', block.pythonName_ || 'main_floor_roomba'),
    hasTarget: block.getFieldValue('USE_TARGET') === 'TRUE' || !!block.hasTarget_,
    hasData: block.getFieldValue('USE_DATA') === 'TRUE' || !!block.hasData_,
  };
}

function saveScriptCallState(block) {
  return {
    mode: block.mode_ || 'entity',
    hasTarget: !!block.hasTarget_,
    hasData: !!block.hasData_,
    entityId: block.entityId_ || '',
    entityText: block.entityText_ || '',
    service: block.service_ || 'turn_on',
    pythonName: block.pythonName_ || 'main_floor_roomba',
  };
}

function syncScriptCallShape(block) {
  const hasTargetInput = !!block.getInput('TARGET');
  const hasDataInput = !!block.getInput('DATA');

  if (block.hasTarget_ && !hasTargetInput) {
    block.appendStatementInput('TARGET')
      .setCheck('HA_ACTION_TARGET')
      .appendField('target');
  } else if (!block.hasTarget_ && hasTargetInput) {
    block.removeInput('TARGET', true);
  }

  if (block.hasData_ && !hasDataInput) {
    block.appendStatementInput('DATA')
      .setCheck('HA_ACTION_DATA')
      .appendField('data');
  } else if (!block.hasData_ && hasDataInput) {
    block.removeInput('DATA', true);
  }

  const expectedTarget = block.hasTarget_ ? 'TRUE' : 'FALSE';
  if (block.getField('USE_TARGET') && block.getFieldValue('USE_TARGET') !== expectedTarget) {
    block.isSyncingTargetField_ = true;
    block.setFieldValue(expectedTarget, 'USE_TARGET');
    block.isSyncingTargetField_ = false;
  }

  const expectedData = block.hasData_ ? 'TRUE' : 'FALSE';
  if (block.getField('USE_DATA') && block.getFieldValue('USE_DATA') !== expectedData) {
    block.isSyncingDataField_ = true;
    block.setFieldValue(expectedData, 'USE_DATA');
    block.isSyncingDataField_ = false;
  }

  ensureScriptInputOrder(block);
  if (block.rendered) block.render();
}

function syncScriptCallMainInput(block, overrides = null) {
  if (block.isRebuildingMain_) return;
  block.isRebuildingMain_ = true;
  try {
    const current = readScriptCallState(block);
    const next = {
      mode: overrides?.mode ?? current.mode,
      entityId: overrides?.entityId ?? current.entityId,
      entityText: overrides?.entityText ?? current.entityText,
      service: overrides?.service ?? current.service,
      pythonName: overrides?.pythonName ?? current.pythonName,
      hasTarget: overrides?.hasTarget ?? current.hasTarget,
      hasData: overrides?.hasData ?? current.hasData,
    };

    block.mode_ = next.mode || 'entity';
    block.entityId_ = next.entityId;
    block.entityText_ = next.entityText || 'script.my_script';
    block.service_ = next.service || 'turn_on';
    block.pythonName_ = next.pythonName || 'main_floor_roomba';
    block.hasTarget_ = !!next.hasTarget;
    block.hasData_ = !!next.hasData;

    if (block.mode_ === 'python' && !String(block.pythonName_ || '').trim()) {
      block.pythonName_ = 'main_floor_roomba';
    }

    if (block.getInput('MAIN')) block.removeInput('MAIN', true);

    const modeField = new Blockly.FieldDropdown(MODE_OPTIONS);
    const input = block.appendDummyInput('MAIN')
      .appendField('script')
      .appendField(modeField, 'MODE');

    if (block.mode_ === 'service') {
      input.appendField(new Blockly.FieldDropdown(SCRIPT_SERVICE_OPTIONS), 'SERVICE');
    } else if (block.mode_ === 'python') {
      input.appendField(new Blockly.FieldTextInput(block.pythonName_), 'PYTHON_NAME');
    } else {
      input.appendField(new Blockly.FieldDropdown(getScriptEntityOptions), 'ENTITY_ID');
      if (block.entityId_ === CUSTOM_ENTITY_VALUE) {
        input.appendField(new Blockly.FieldTextInput(block.entityText_), 'ENTITY_TEXT');
      }
    }

    input
      .appendField('target')
      .appendField(new Blockly.FieldCheckbox(block.hasTarget_ ? 'TRUE' : 'FALSE'), 'USE_TARGET')
      .appendField('data')
      .appendField(new Blockly.FieldCheckbox(block.hasData_ ? 'TRUE' : 'FALSE'), 'USE_DATA');

    if (block.getField('MODE')) block.setFieldValue(block.mode_, 'MODE');
    if (block.mode_ === 'service' && block.getField('SERVICE')) {
      block.setFieldValue(block.service_, 'SERVICE');
    }
    if (block.mode_ === 'python' && block.getField('PYTHON_NAME')) {
      block.setFieldValue(block.pythonName_, 'PYTHON_NAME');
    }
    if (block.mode_ === 'entity' && block.getField('ENTITY_ID')) {
      const ok = setAndKeepDropdownValue(block, 'ENTITY_ID', block.entityId_);
      if (!ok) block.setFieldValue(CUSTOM_ENTITY_VALUE, 'ENTITY_ID');
      block.entityId_ = String(block.getFieldValue('ENTITY_ID') || '');
      if (block.entityId_ === CUSTOM_ENTITY_VALUE && block.getField('ENTITY_TEXT')) {
        block.setFieldValue(block.entityText_, 'ENTITY_TEXT');
      }
    }

    modeField.setValidator((newVal) => {
      block.mode_ = String(newVal || 'entity');
      if (block.mode_ === 'python' && !String(block.pythonName_ || '').trim()) {
        block.pythonName_ = 'main_floor_roomba';
      }
      syncScriptCallMainInput(block, { mode: block.mode_ });
      return block.mode_;
    });

    block.getField('ENTITY_ID')?.setValidator((newVal) => {
      block.entityId_ = String(newVal || '');
      syncScriptCallMainInput(block, { entityId: block.entityId_ });
      return block.entityId_;
    });

    block.getField('ENTITY_TEXT')?.setValidator((newVal) => {
      block.entityText_ = String(newVal || '');
      return block.entityText_;
    });

    block.getField('SERVICE')?.setValidator((newVal) => {
      block.service_ = String(newVal || '');
      return block.service_;
    });

    block.getField('PYTHON_NAME')?.setValidator((newVal) => {
      block.pythonName_ = String(newVal || '');
      if (!String(block.pythonName_ || '').trim()) {
        block.pythonName_ = 'main_floor_roomba';
      }
      return block.pythonName_;
    });

    block.getField('USE_TARGET')?.setValidator((newVal) => {
      if (block.isSyncingTargetField_) return newVal;
      block.hasTarget_ = newVal === 'TRUE';
      syncScriptCallShape(block);
      return newVal;
    });

    block.getField('USE_DATA')?.setValidator((newVal) => {
      if (block.isSyncingDataField_) return newVal;
      block.hasData_ = newVal === 'TRUE';
      syncScriptCallShape(block);
      return newVal;
    });

    ensureScriptInputOrder(block);
  } finally {
    block.isRebuildingMain_ = false;
    if (block.rendered) block.render();
  }
}

function loadScriptCallState(block, state) {
  block.mode_ = state?.mode || block.mode_ || 'entity';
  block.hasTarget_ = !!state?.hasTarget;
  block.hasData_ = !!state?.hasData;
  block.entityId_ = String(state?.entityId ?? block.entityId_ ?? '');
  block.entityText_ = String(state?.entityText ?? block.entityText_ ?? 'script.my_script');
  block.service_ = String(state?.service ?? block.service_ ?? 'turn_on');
  block.pythonName_ = String(state?.pythonName ?? block.pythonName_ ?? 'main_floor_roomba');
  if (block.mode_ === 'python' && !String(block.pythonName_ || '').trim()) {
    block.pythonName_ = 'main_floor_roomba';
  }
  syncScriptCallMainInput(block);
  syncScriptCallShape(block);
}

function initScriptCallBlock(block) {
  block.mode_ = 'entity';
  block.hasTarget_ = false;
  block.hasData_ = false;
  block.entityId_ = '';
  block.entityText_ = 'script.my_script';
  block.service_ = 'turn_on';
  block.pythonName_ = 'main_floor_roomba';
  block.isRebuildingMain_ = false;
  block.isSyncingTargetField_ = false;
  block.isSyncingDataField_ = false;

  block.setPreviousStatement(true, 'HA_ACTION');
  block.setNextStatement(true, 'HA_ACTION');
  block.setColour('#E3CC57');
  block.setTooltip('Runs script.* or python_script.* actions.');
  block.setHelpUrl('');
  block.setInputsInline(true);

  syncScriptCallMainInput(block);
  syncScriptCallShape(block);
}

function buildScriptCallContextMenu(block, options) {
  options.push({
    text: block.hasTarget_ ? 'Hide target' : 'Show target',
    enabled: true,
    callback: () => {
      block.hasTarget_ = !block.hasTarget_;
      syncScriptCallShape(block);
    },
  });
  options.push({
    text: block.hasData_ ? 'Hide data' : 'Show data',
    enabled: true,
    callback: () => {
      block.hasData_ = !block.hasData_;
      syncScriptCallShape(block);
    },
  });
}

function syncScriptTargetEntityBlock(block) {
  const isCustom = block.getFieldValue('ENTITY_ID') === CUSTOM_ENTITY_VALUE;
  setFieldVisible(block, 'ENTITY_TEXT', isCustom);
  if (block.rendered) block.render();
}

function initScriptTargetEntityBlock(block) {
  block.appendDummyInput('ROW')
    .appendField('entity')
    .appendField(new Blockly.FieldDropdown(getScriptEntityOptions), 'ENTITY_ID')
    .appendField(new Blockly.FieldTextInput('script.my_script'), 'ENTITY_TEXT');

  block.setPreviousStatement(true, 'HA_ACTION_TARGET');
  block.setNextStatement(true, 'HA_ACTION_TARGET');
  block.setColour('#E3CC57');
  block.setTooltip('Sets a script entity as the target.');
  block.setHelpUrl('');
  block.setInputsInline(true);

  block.getField('ENTITY_ID')?.setValidator((newVal) => {
    syncScriptTargetEntityBlock(block);
    return newVal;
  });

  syncScriptTargetEntityBlock(block);
}

Blockly.Blocks.action_script_call = {
  mode_: 'entity',
  hasTarget_: false,
  hasData_: false,
  entityId_: '',
  entityText_: 'script.my_script',
  service_: 'turn_on',
  pythonName_: 'main_floor_roomba',
  isRebuildingMain_: false,
  isSyncingTargetField_: false,
  isSyncingDataField_: false,

  saveExtraState: withBlock(saveScriptCallState),
  loadExtraState: withBlock(loadScriptCallState),
  init: withBlock(initScriptCallBlock),
  updateMainInput_: withBlock(syncScriptCallMainInput),
  updateShape_: withBlock(syncScriptCallShape),
  customContextMenu: withBlock(buildScriptCallContextMenu),
};

Blockly.Blocks.action_script_target_entity = {
  init: withBlock(initScriptTargetEntityBlock),
};

export const actionScriptBlocks = Blockly.common.createBlockDefinitionsFromJsonArray([]);
