// src/blocks/event/event_template.js
import * as Blockly from 'blockly';

Blockly.Extensions.register('ha_event_template_toggle_id', function () {
  const refresh = () => {
    const useId = this.getFieldValue('USE_ID') === 'TRUE';
    this.getField('ID')?.setVisible(useId);
    if (!useId) this.setFieldValue('', 'ID');
    if (this.rendered) this.render();
  };

  this.getField('USE_ID')?.setValidator((newVal) => {
    setTimeout(refresh, 0);
    return newVal;
  });

  refresh();
});

export const eventTemplateBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    {
      type: 'ha_event_template',
      message0: 'template %1 id %2 %3 %4',
      args0: [
        { type: 'field_input', name: 'TEMPLATE', text: '' },
        { type: 'field_checkbox', name: 'USE_ID', checked: false },
        { type: 'field_input', name: 'ID', text: '' },
        { type: 'input_value', name: 'FOR', check: 'DURATION' },
      ],
      previousStatement: 'HA_EVENT',
      nextStatement: 'HA_EVENT',
      colour: 180,
      tooltip: 'template trigger를 설정합니다.',
      helpUrl: '',
      extensions: ['ha_event_template_toggle_id'],
    },
  ]);
