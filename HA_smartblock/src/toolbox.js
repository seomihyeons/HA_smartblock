export const toolbox = {
  "kind": "categoryToolbox",
  "contents": [
    {
      "kind": "category",
      "name": "Rule",
      "categorystyle": "rule_category",
      "contents": [
        { "kind": "block", "type": "event_action" },
        { "kind": "block", "type": "event_condition_action" }
      ]
    },
    {
      "kind": "category",
      "name": "Event",
      "categorystyle": "event_category",
      "contents": [
        { "kind": "label", "text": "Home Assistant" },
        { "kind": "block", "type": "ha_event_homeassistant" },
        { "kind": "label", "text": "State" },
        { "kind": "block", "type": "ha_event_light_state" },
        { "kind": "block", "type": "ha_event_binary_state" },
        { "kind": "block", "type": "ha_event_switch_state" },
        { "kind": "block", "type": "ha_event_lock_state" },
        { "kind": "block", "type": "ha_event_numeric_state_sensor" },
        { "kind": "label", "text": "Time" },
        { "kind": "block", "type": "ha_event_for_hms" },
        { "kind": "label", "text": "Sun" },
        { "kind": "block", "type": "ha_event_sun" },
        { "kind": "block", "type": "ha_event_offset" },
      ]
    },
    {
      "kind": "category",
      "name": "Condition",
      "categorystyle": "condition_category",
      "contents": [
        { "kind": "label", "text": "Logic" },
        { "kind": "block", "type": "condition_logic"},
        { "kind": "label", "text": "State" },
        { "kind": "block", "type": "condition_state_light" },
        { "kind": "block", "type": "condition_state_switch" },
        { "kind": "block", "type": "condition_state_lock" },
        { "kind": "block", "type": "condition_state_media_player" },
        { "kind": "block", "type": "condition_state_binary_sensor" },
        { "kind": "block", "type": "condition_state_climate" },
        { "kind": "label", "text": "Numeric State" },
        { "kind": "block", "type": "condition_numeric_state_entity" },
        { "kind": "block", "type": "condition_numeric_state_attribute" }
      ]
    },
    {
      "kind": "category",
      "name": "Action",
      "categorystyle": "action_category",
      "contents": [
        { "kind": "label", "text": "Action" },
        { "kind": "block", "type": "action_light" },
        { "kind": "block", "type": "action_switch" },
        { "kind": "block", "type": "action_lock" },
        { "kind": "block", "type": "action_media_player" },
        { "kind": "label", "text": "Delay" },
        { "kind": "block", "type": "action_delay" },
        { "kind": "label", "text": "Logic" },
        { "kind": 'block', "type": 'action_if_else' }, 
        { "kind": 'block', "type": 'action_if_then' },
        { "kind": "label", "text": "Notify" },
        { "kind": 'block', "type": 'action_notify' },
        { "kind": 'block', "type": 'action_notify_title' }
      ]
    }
  ]
};
