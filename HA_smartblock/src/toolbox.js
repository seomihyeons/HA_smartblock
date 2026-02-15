import { STATE_DOMAINS, ACTION_DOMAINS } from './data/options.js';

const eventStateBlocks = (STATE_DOMAINS || [])
  .filter((d) => d !== 'sensor')
  .map((domain) => ({ kind: 'block', type: `event_${domain}_state` }));

const conditionStateBlocks = (STATE_DOMAINS || [])
  .map((domain) => ({ kind: 'block', type: `condition_state_${domain}` }));

const actionBlocks = (ACTION_DOMAINS || [])
  .map((domain) => ({ kind: 'block', type: `action_${domain}` }));

export const toolbox = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Rule',
      categorystyle: 'rule_category',
      contents: [
        { kind: 'block', type: 'event_action' },
        { kind: 'block', type: 'event_condition_action' },
      ],
    },
    {
      kind: 'category',
      name: 'Event',
      categorystyle: 'event_category',
      contents: [
        { kind: 'label', text: 'Home Assistant' },
        { kind: 'block', type: 'ha_event_homeassistant' },
        { kind: 'label', text: 'State' },
        ...eventStateBlocks,
        { kind: 'block', type: 'event_sensor_numeric_state' },
        { kind: 'label', text: 'Time' },
        { kind: 'block', type: 'ha_event_time_state' },
        { kind: 'block', type: 'ha_event_for_hms' },
        { kind: 'label', text: 'Sun' },
        { kind: 'block', type: 'ha_event_sun' },
        { kind: 'block', type: 'ha_event_offset' },
        { kind: 'block', type: 'ha_event_sun_state' },
      ],
    },
    {
      kind: 'category',
      name: 'Condition',
      categorystyle: 'condition_category',
      contents: [
        { kind: 'label', text: 'Logic' },
        { kind: 'block', type: 'condition_logic' },
        { kind: 'block', type: 'condition_not_value' },
        { kind: 'label', text: 'Time' },
        { kind: 'block', type: 'condition_time' },
        { kind: 'label', text: 'State' },
        ...conditionStateBlocks,
        { kind: 'label', text: 'Numeric State' },
        { kind: 'block', type: 'condition_numeric_state_entity' },
        { kind: 'block', type: 'condition_numeric_state_attribute' },
      ],
    },
    {
      kind: 'category',
      name: 'Action',
      categorystyle: 'action_category',
      contents: [
        { kind: 'label', text: 'Action' },
        ...actionBlocks,
        { kind: 'label', text: 'Group' },
        { kind: 'block', type: 'action_group_entities' },
        { kind: 'block', type: 'action_group_entity_item' },
        { kind: 'label', text: 'Data' },
        { kind: 'block', type: 'action_data_brightness_pct' },
        { kind: 'block', type: 'action_data_transition' },
        { kind: 'block', type: 'action_data_color' },
        { kind: 'block', type: 'action_data_effect' },
        { kind: 'block', type: 'action_data_announce' },
        { kind: 'block', type: 'action_data_media_content_type' },
        { kind: 'block', type: 'action_data_climate_preset_mode' },
        { kind: 'block', type: 'action_data_kv_text' },
        { kind: 'label', text: 'Delay' },
        { kind: 'block', type: 'action_delay' },
        { kind: 'label', text: 'Logic' },
        { kind: 'block', type: 'action_if_else' },
        { kind: 'block', type: 'action_if_then' },
        { kind: 'label', text: 'Notify' },
        { kind: 'block', type: 'action_notify' },
        { kind: 'block', type: 'action_notify_message_text' },
        { kind: 'block', type: 'action_notify_message_template' },
        { kind: 'label', text: 'Notify Tag' },
        { kind: 'block', type: 'action_notify_tag' },
        { kind: 'block', type: 'notify_tag' },
        { kind: 'block', type: 'notify_action' },
        { kind: 'block', type: 'notify_prop_title' },
        { kind: 'block', type: 'notify_prop_destructive' },
        { kind: 'block', type: 'notify_prop_activationMode' },
        { kind: 'block', type: 'notify_push' },
        { kind: 'block', type: 'notify_push_name' },
        { kind: 'block', type: 'notify_push_critical' },
      ],
    },
  ],
};
