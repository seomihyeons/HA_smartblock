import { STATE_DOMAINS, ACTION_DOMAINS } from './data/options.js';
import { getToolboxBlockSortLabel, isToolboxBlockAvailable } from './toolbox_availability.js';

let unavailableBlockTypes = new Set();

function sortSectionBlocks(items, entities) {
  return [...items].sort((left, right) => {
    const leftAvailable = isToolboxBlockAvailable(left.type, entities);
    const rightAvailable = isToolboxBlockAvailable(right.type, entities);
    if (leftAvailable !== rightAvailable) return leftAvailable ? -1 : 1;

    return getToolboxBlockSortLabel(left.type).localeCompare(
      getToolboxBlockSortLabel(right.type),
      'en',
      { sensitivity: 'base' }
    );
  });
}

// Labels preserve the conceptual section order. Only blocks between two labels
// are reordered: matching runtime targets first, then no-target blocks, with
// English A-Z ordering inside both groups.
function sortCategoryContents(contents, entities) {
  const sorted = [];
  let sectionBlocks = [];

  const flushSection = () => {
    if (!sectionBlocks.length) return;
    sorted.push(...sortSectionBlocks(sectionBlocks, entities));
    sectionBlocks = [];
  };

  for (const item of contents) {
    if (item.kind === 'label') {
      flushSection();
      sorted.push(item);
    } else if (item.kind === 'block') {
      sectionBlocks.push(item);
    } else {
      flushSection();
      sorted.push(item);
    }
  }
  flushSection();
  return sorted;
}

function collectUnavailableBlockTypes(toolbox, entities) {
  const types = new Set();
  for (const category of toolbox.contents || []) {
    for (const item of category.contents || []) {
      if (item.kind === 'block' && !isToolboxBlockAvailable(item.type, entities)) {
        types.add(item.type);
      }
    }
  }
  return types;
}

/**
 * Creates the complete set of supported Home Assistant blocks. Runtime
 * entities populate their dropdowns, but must never determine whether a
 * supported block exists: an empty domain is represented by its `(No
 * entities)` dropdown option so the block remains discoverable and usable.
 */
export function createToolbox(entities = []) {
  const eventStateBlocks = (STATE_DOMAINS || [])
    .filter((domain) => domain !== 'sensor')
    .map((domain) => ({ kind: 'block', type: `event_${domain}_state` }));

  const conditionStateBlocks = (STATE_DOMAINS || [])
    .map((domain) => ({ kind: 'block', type: `condition_state_${domain}` }));

  const actionBlocks = (ACTION_DOMAINS || [])
    .filter((domain) => !['ecobee', 'script', 'python_script', 'mqtt'].includes(domain))
    .map((domain) => ({ kind: 'block', type: `action_${domain}` }));

  const toolboxDefinition = {
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
      name: 'Trigger',
      categorystyle: 'event_category',
      contents: [
        { kind: 'label', text: 'State' },
        ...eventStateBlocks,
        { kind: 'label', text: 'Home Assistant' },
        { kind: 'block', type: 'ha_event_homeassistant' },
        { kind: 'label', text: 'Event' },
        { kind: 'block', type: 'ha_event_event' },
        { kind: 'block', type: 'ha_event_kv' },
        { kind: 'block', type: 'ha_event_event_data_call_service' },
        { kind: 'block', type: 'ha_event_service_data_entity_id' },
        { kind: 'block', type: 'ha_event_context_kv' },
        { kind: 'label', text: 'MQTT' },
        { kind: 'block', type: 'ha_event_mqtt' },
        { kind: 'block', type: 'ha_event_mqtt_payload' },
        { kind: 'block', type: 'ha_event_mqtt_value_template' },
        { kind: 'block', type: 'ha_event_mqtt_encoding' },
        { kind: 'label', text: 'Group' },
        { kind: 'block', type: 'event_group_entities' },
        { kind: 'block', type: 'event_group_numeric_entities' },
        { kind: 'block', type: 'event_group_entity_item' },
        { kind: 'block', type: 'event_sensor_numeric_state' },
        { kind: 'label', text: 'Time' },
        { kind: 'block', type: 'ha_event_time_state' },
        { kind: 'block', type: 'ha_event_time_pattern' },
        { kind: 'block', type: 'ha_event_for_hms' },
        { kind: 'label', text: 'Template' },
        { kind: 'block', type: 'ha_event_template' },
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
        { kind: 'label', text: 'State' },
        ...conditionStateBlocks,
        { kind: 'label', text: 'Logic' },
        { kind: 'block', type: 'condition_logic' },
        { kind: 'block', type: 'condition_not_value' },
        { kind: 'label', text: 'Template' },
        { kind: 'block', type: 'condition_template' },
        { kind: 'label', text: 'Time' },
        { kind: 'block', type: 'condition_time' },
        { kind: 'block', type: 'condition_time_weekly' },
        { kind: 'label', text: 'Sun' },
        { kind: 'block', type: 'condition_sun_phase' },
        { kind: 'block', type: 'condition_sun' },
        { kind: 'block', type: 'condition_sun_after' },
        { kind: 'block', type: 'condition_sun_before' },
        { kind: 'block', type: 'condition_sun_offset' },
        { kind: 'label', text: 'Zone' },
        { kind: 'block', type: 'condition_zone_membership' },
        { kind: 'label', text: 'Numeric State' },
        { kind: 'block', type: 'condition_numeric_state_entity' },
        { kind: 'block', type: 'condition_numeric_state_attribute' },
        { kind: 'label', text: 'Data' },
        { kind: 'block', type: 'condition_data_attribute' },
        { kind: 'block', type: 'condition_data_state' },
      ],
    },
    {
      kind: 'category',
      name: 'Action',
      categorystyle: 'action_category',
      contents: [
        { kind: 'label', text: 'Action' },
        ...actionBlocks,
        { kind: 'block', type: 'action_ecobee_service' },
        { kind: 'block', type: 'action_script_call' },
        { kind: 'block', type: 'action_script_target_entity' },
        { kind: 'label', text: 'Group' },
        { kind: 'block', type: 'action_group_entities' },
        { kind: 'block', type: 'action_join' },
        { kind: 'block', type: 'action_group_entity_item' },
        { kind: 'label', text: 'MQTT' },
        { kind: 'block', type: 'action_mqtt_publish' },
        { kind: 'block', type: 'action_mqtt_payload_text' },
        { kind: 'block', type: 'action_mqtt_qos' },
        { kind: 'block', type: 'action_mqtt_retain' },
        { kind: 'block', type: 'action_mqtt_evaluate_payload' },
        { kind: 'block', type: 'action_mqtt_data_kv' },
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
        {
          kind: 'block',
          type: 'action_notify',
          // A notification message is required by notify.send_message.
          // Seed a connected text block only for newly dragged Toolbox blocks;
          // YAML import creates its own text child from data.message instead.
          inputs: {
            MESSAGE_BLOCKS: {
              block: {
                type: 'action_notify_message_text',
                fields: { TEXT: 'input message' },
              },
            },
          },
        },
        { kind: 'block', type: 'action_notify_message_text' },
        { kind: 'block', type: 'action_notify_message_template' },
        { kind: 'label', text: 'Notify Tag' },
        { kind: 'block', type: 'action_notify_tag' },
        { kind: 'block', type: 'notify_tag' },
        { kind: 'block', type: 'notify_action' },
        { kind: 'block', type: 'notify_prop_title' },
        { kind: 'block', type: 'notify_prop_destructive' },
        { kind: 'block', type: 'notify_prop_activationMode' },
        { kind: 'block', type: 'notify_push_option' },
      ],
    },
  ],
  };

  toolboxDefinition.contents.forEach((category) => {
    category.contents = sortCategoryContents(category.contents || [], entities);
  });
  return toolboxDefinition;
}

// Kept as a live binding so Blockly and Block Search read the same toolbox.
export let toolbox = createToolbox();

// Compatibility entry point used by application startup. Entity data belongs
// to block dropdowns; it intentionally does not prune supported block types.
export function setToolboxEntities(entities) {
  toolbox = createToolbox(entities);
  unavailableBlockTypes = collectUnavailableBlockTypes(toolbox, entities);
  return toolbox;
}

// Flyout blocks are separate Blockly instances from workspace blocks. Adding
// this class only to flyout SVG roots keeps imported and user-created blocks
// fully opaque and does not change enabled/disabled Blockly semantics.
export function refreshFlyoutAvailabilityStyles(flyout) {
  const apply = () => {
    const flyoutWorkspace = flyout?.getWorkspace?.();
    for (const block of flyoutWorkspace?.getTopBlocks?.(false) || []) {
      block.getSvgRoot?.()?.classList.toggle(
        'ha-toolbox-unavailable',
        unavailableBlockTypes.has(block.type)
      );
    }
  };

  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply);
  else setTimeout(apply, 0);
}

export function refreshToolboxAvailabilityStyles(workspace) {
  refreshFlyoutAvailabilityStyles(workspace?.getToolbox?.()?.getFlyout?.());
}
