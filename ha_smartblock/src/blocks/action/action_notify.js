// src/blocks/action/action_notify.js
import * as Blockly from 'blockly';
import { getNotifyTargetOptions, NOTIFY_TEMPLATE_KINDS } from '../../data/options.js';

function updateNotifyPushOptionShape(block) {
  if (!block) return;
  const option = String(block.getFieldValue('OPTION') || 'none');
  const savedSoundMode = String(block.__soundMode || block.getFieldValue('SOUND_MODE') || 'text');

  const existing = block.getInput('VALUE');
  if (existing) block.removeInput('VALUE', true);
  if (option === 'none') {
    if (block.rendered) block.render();
    return;
  }

  const row = block.appendDummyInput('VALUE');

  if (option === 'badge') {
    row.appendField('value')
      .appendField(new Blockly.FieldNumber(1, 0, 999, 1), 'BADGE');
  } else if (option === 'interruption_level') {
    row.appendField('value')
      .appendField(new Blockly.FieldDropdown([
        ['passive', 'passive'],
        ['active', 'active'],
        ['time-sensitive', 'time-sensitive'],
        ['critical', 'critical'],
      ]), 'INTERRUPTION_LEVEL');
  } else if (option === 'sound') {
    row.appendField('mode')
      .appendField(new Blockly.FieldDropdown([
        ['text', 'text'],
        ['default', 'default'],
        ['none', 'none'],
        ['critical', 'critical'],
      ], function (newMode) {
        const b = this.getSourceBlock();
        if (!b) return newMode;
        b.__soundMode = newMode;
        // Defer shape update until after Blockly commits field value.
        setTimeout(() => {
          if (!b.workspace) return;
          updateNotifyPushOptionShape(b);
        }, 0);
        return newMode;
      }), 'SOUND_MODE');

    // Restore previously selected mode after dynamic row rebuild.
    if (savedSoundMode && savedSoundMode !== 'text' && block.getField('SOUND_MODE')) {
      block.setFieldValue(savedSoundMode, 'SOUND_MODE');
    }

    const mode = String(block.__soundMode || block.getFieldValue('SOUND_MODE') || 'text');
    if (mode === 'text') {
      row.appendField('name').appendField(new Blockly.FieldTextInput('default'), 'SOUND_TEXT');
    } else if (mode === 'critical') {
      row
        .appendField('name').appendField(new Blockly.FieldTextInput('default'), 'SOUND_NAME')
        .appendField('critical').appendField(new Blockly.FieldNumber(1, 0, 1, 1), 'SOUND_CRITICAL')
        .appendField('volume').appendField(new Blockly.FieldNumber(1, 0, 1, 0.1), 'SOUND_VOLUME');
    }
  }

  if (block.rendered) block.render();
}

Blockly.Extensions.register('notify_push_option_dynamic', function () {
  // Import mapper can call this to force dynamic row rebuild even when
  // Blockly change events are not fired during programmatic field sets.
  this.rebuildNotifyPushOption_ = () => updateNotifyPushOptionShape(this);

  this.setOnChange((e) => {
    if (!e) return;
    const t = String(e.type || '');
    if (t === Blockly.Events.BLOCK_CREATE) {
      if (e.blockId === this.id) updateNotifyPushOptionShape(this);
      return;
    }
    if (t !== Blockly.Events.BLOCK_CHANGE) return;
    if (e.blockId !== this.id) return;
    if (e.name !== 'OPTION' && e.name !== 'SOUND_MODE') return;
    if (e.name === 'SOUND_MODE' && e.newValue != null) {
      this.__soundMode = String(e.newValue);
    }
    updateNotifyPushOptionShape(this);
  });
  updateNotifyPushOptionShape(this);
});

export const actionNotifyBlocks = Blockly.common.createBlockDefinitionsFromJsonArray([
  {
    type: 'action_notify',
    message0: 'notify %1',
    args0: [
      { type: 'field_dropdown', name: 'TARGET', options: getNotifyTargetOptions },
    ],
    message1: '%1',
    args1: [ { type: 'input_statement', name: 'MESSAGE_BLOCKS', check: 'HA_NOTIFY' }, ],
    previousStatement: 'HA_ACTION',
    nextStatement: 'HA_ACTION',
    colour: '#E3CC57',
    tooltip: 'Configures the notify target and message in one block. Tag, entity, and action blocks can be connected below.',
    helpUrl: '',
  },
  // Legacy compatibility blocks: keep definitions so old saved workspaces can load.
  {
    type: 'action_message',
    message0: 'message',
    message1: '%1',
    args1: [ { type: 'input_statement', name: 'MESSAGE_BLOCKS', check: 'HA_NOTIFY' } ],
    previousStatement: 'HA_NOTIFY',
    nextStatement: 'HA_NOTIFY',
    colour: '#E3CC57',
    tooltip: 'Legacy block (kept for compatibility).',
    helpUrl: '',
  },
  {
    type: 'action_notify_message_text',
    message0: 'text %1',
    args0: [ { type: 'field_input', name: 'TEXT', text: 'input message', spellcheck: true } ],
    previousStatement: 'HA_NOTIFY',
    nextStatement: 'HA_NOTIFY',
    colour: '#E3CC57',
    tooltip: 'Legacy block (kept for compatibility).',
    helpUrl: '',
  },
  {
    type: 'action_notify_message_template',
    message0: 'template %1',
    args0: [ { type: 'field_dropdown', name: 'TEMPLATE_KIND', options: NOTIFY_TEMPLATE_KINDS } ],
    previousStatement: 'HA_NOTIFY',
    nextStatement: 'HA_NOTIFY',
    colour: '#E3CC57',
    tooltip: 'Legacy block (kept for compatibility).',
    helpUrl: '',
  },
  {
    type: 'notify_push_option',
    message0: 'push %1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'OPTION',
        options: [
          ['-', 'none'],
          ['sound', 'sound'],
          ['badge', 'badge'],
          ['interruption-level', 'interruption_level'],
        ],
      },
    ],
    previousStatement: ['HA_NOTIFY', 'HA_NOTIFY_TAG'],
    nextStatement: ['HA_NOTIFY', 'HA_NOTIFY_TAG'],
    colour: '#E3CC57',
    tooltip: 'Configures the notify data.data.push option.',
    helpUrl: '',
    extensions: ['notify_push_option_dynamic'],
  },
]);
