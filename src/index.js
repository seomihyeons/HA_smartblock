/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Blockly from 'blockly';
import { save, load } from './serialization';
import { setupYamlExportButtons } from './export_code';
import { setupYamlImportButton } from './import/import_button';
import { yamlTextToInternalJson } from './import/yaml_import';
import { showImportDebugJson } from './import/import_debug_panel';
import { renderAutomationToWorkspace } from './import/yamlToBlocks';
import './blocks/extensions.js';

import { initConflictAnalyzerUI } from "./homeassistant/conflict_analyzer/debug_ui";
import { setupHaPullPanel } from './homeassistant/ha_pull_panel';
import { initTaskAltUI } from '../test/task_alt/task_alt_ui';
import { initAiAssistantUI } from './homeassistant/llm_assistant/assistant_ui';
import { initBlockSearchFlyout } from './block_search_flyout.js';
import { installEntityDropdownSearch } from './blocks/utils/searchable_entity_dropdown.js';
import { decorateBlockDefinitionsWithFilledIcons, installFilledIconsOnWorkspace } from './icons/block_filled_icons.js';
import { createEntityStateStore } from './icons/entity_state_store.js';
import { installLiveEntityIcons, setEntityIconStateStore } from './icons/entity_dropdown_icons.js';
import { createWorkspaceDirtyTracker } from './utils/workspace_dirty_tracker.js';
import { replaceWorkspaceSafely } from './utils/safe_workspace_replace.js';
import { confirmDiscardUnsavedChanges } from './utils/unsaved_changes_dialog.js';
import { generateScopedYaml, generateScopedYamlWithSourceMap } from './utils/automation_yaml_scope.js';
import { renderYamlPreview } from './utils/yaml_preview_trace.js';

import './index.css';
import { yamlGenerator } from './generators/yaml';
import { dummyEntities, loadRuntimeHomeAssistantEntities } from './data/entities_index.js';

import { toolbox, setToolboxEntities, refreshToolboxAvailabilityStyles } from './toolbox';
import { customTheme } from './utils/custom_theme.js';

import './blocks/extensions';

import { ruleBlocks } from './blocks/rule_blocks';
import { ruleMetadataBlocks } from './blocks/rule_metadata.js';
import { rawLinesBlocks } from './blocks/raw_lines';

import { haEventStateBlocks } from './blocks/event/event_HA_state';
import { eventEntityBlocks } from './blocks/event/event_entity.js';
import { eventGroupBlocks } from './blocks/event/event_group.js';
import { eventNumericSensorBlocks } from './blocks/event/event_sensor_state';
import { eventTimeStateBlocks } from './blocks/event/event_time_state';
import { eventTemplateBlocks } from './blocks/event/event_template';
import { eventForBlocks } from './blocks/event/event_for';
import { haEventSunBlocks } from './blocks/event/event_sun';
import { eventSunStateBlocks } from './blocks/event/event_sun_state';
import { eventEventBlocks } from './blocks/event/event_event';
import { eventMqttBlocks } from './blocks/event/event_mqtt';

import { conditionLogicBlocks } from './blocks/condition/condition_logic';
import { conditionStateBlocks } from './blocks/condition/condition_entity_state';
import { conditionSunBlocks } from './blocks/condition/condition_sun';
import { conditionZoneBlocks } from './blocks/condition/condition_zone';
import { conditionTimeBlocks } from './blocks/condition/condition_time';
import { conditionTemplateBlocks } from './blocks/condition/condition_template';
import { conditionNumericStateEntityBlocks } from './blocks/condition/condition_numeric_state_entity';
import { conditionNumericStateAttributeBlocks } from './blocks/condition/condition_numeric_state_attribute';

import { actionEntityBlocks } from './blocks/action/action_entity';
import { actionEcobeeBlocks } from './blocks/action/action_ecobee';
import { actionDelayBlocks } from './blocks/action/action_delay';
import { actionIfBlocks } from './blocks/action/action_if';
import { actionNotifyBlocks } from './blocks/action/action_notify';
import { actionGroupBlocks } from './blocks/action/action.group';
import { actionJoinBlocks } from './blocks/action/action_join';
import { actionScriptBlocks } from './blocks/action/action_script.js';
import { actionNotifyTagBlocks } from './blocks/action/action_notify_tag.js';
import { actionDataBlocks } from './blocks/action/action_data.js';
import { actionMqttBlocks } from './blocks/action/action_mqtt.js';

async function bootstrap() {
  const entityLoad = await loadRuntimeHomeAssistantEntities();
  if (!entityLoad.ok) {
    console.warn('XHome entities could not be loaded; Entity selectors are empty.', entityLoad.error);
  }
  // The live XHome catalog is ready before blocks, dropdowns and Search are built.
  setToolboxEntities(dummyEntities);

Blockly.common.defineBlocks(rawLinesBlocks);
Blockly.common.defineBlocks(ruleBlocks);
Blockly.common.defineBlocks(ruleMetadataBlocks);

Blockly.common.defineBlocks(haEventStateBlocks);
Blockly.common.defineBlocks(eventEntityBlocks);
Blockly.common.defineBlocks(eventGroupBlocks);
Blockly.common.defineBlocks(eventNumericSensorBlocks);
Blockly.common.defineBlocks(eventTimeStateBlocks);
Blockly.common.defineBlocks(eventTemplateBlocks);
Blockly.common.defineBlocks(eventForBlocks);
Blockly.common.defineBlocks(haEventSunBlocks);
Blockly.common.defineBlocks(eventSunStateBlocks);
Blockly.common.defineBlocks(eventEventBlocks);
Blockly.common.defineBlocks(eventMqttBlocks);

Blockly.common.defineBlocks(conditionLogicBlocks);
Blockly.common.defineBlocks(conditionStateBlocks);
Blockly.common.defineBlocks(conditionSunBlocks);
Blockly.common.defineBlocks(conditionZoneBlocks);
Blockly.common.defineBlocks(conditionTimeBlocks);
Blockly.common.defineBlocks(conditionTemplateBlocks);
Blockly.common.defineBlocks(conditionNumericStateEntityBlocks);
Blockly.common.defineBlocks(conditionNumericStateAttributeBlocks);

Blockly.common.defineBlocks(actionEntityBlocks);
Blockly.common.defineBlocks(actionEcobeeBlocks);
Blockly.common.defineBlocks(actionDataBlocks);
Blockly.common.defineBlocks(actionDelayBlocks);
Blockly.common.defineBlocks(actionIfBlocks);
Blockly.common.defineBlocks(actionNotifyBlocks);
Blockly.common.defineBlocks(actionGroupBlocks);
Blockly.common.defineBlocks(actionJoinBlocks);
Blockly.common.defineBlocks(actionScriptBlocks);
Blockly.common.defineBlocks(actionNotifyTagBlocks);
Blockly.common.defineBlocks(actionMqttBlocks);

// Icons are presentation-only fields. Install them after every block
// definition exists, before Blockly creates its Toolbox preview blocks.
decorateBlockDefinitionsWithFilledIcons();
const entityStateStore = createEntityStateStore({
  initialEntities: dummyEntities,
  // The current Node backend does not expose the icon branch's SSE endpoint.
  // Poll the existing Home Assistant proxy instead.
  eventSourceFactory: null,
});
setEntityIconStateStore(entityStateStore);

const codeDiv = document.getElementById('generatedCode');
const blocklyDiv = document.getElementById('blocklyDiv');
let latestYamlPreview = { yaml: '', ranges: new Map() };
let selectedYamlBlockId = null;
const ws = Blockly.inject(blocklyDiv, {
  toolbox,
  theme: customTheme,
  move: {
    scrollbars: true,
    drag: true,
    wheel: true,
  },
  zoom: {
    controls: false,
    wheel: true,
    pinch: true,
    startScale: 1,
    minScale: 0.4,
    maxScale: 2.5,
    scaleSpeed: 1.15,
  },
});

installFilledIconsOnWorkspace(ws);
window.Blockly = Blockly;
window.ws = ws;
installLiveEntityIcons(ws, entityStateStore);
const nativeFlyoutWorkspace = ws.getToolbox?.()?.getFlyout?.()?.getWorkspace?.();
if (nativeFlyoutWorkspace) installLiveEntityIcons(nativeFlyoutWorkspace, entityStateStore);
const refreshEntityDropdownSearch = installEntityDropdownSearch(ws, entityStateStore);
entityStateStore.start();
const workspaceChangeTracker = createWorkspaceDirtyTracker(ws);

ws.addChangeListener((event) => {
  if (event.type === Blockly.Events.TOOLBOX_ITEM_SELECT) refreshToolboxAvailabilityStyles(ws);
});
refreshToolboxAvailabilityStyles(ws);

setupYamlExportButtons('generatedCode', ws);
setupYamlImportButton({ outputId: 'generatedCode', ws: ws });


document.addEventListener('yaml-imported', async (e) => {
  try {
    const yamlText = e.detail.text;
    const internal = yamlTextToInternalJson(yamlText);

    if (!await workspaceChangeTracker.confirmBeforeReplace(() =>
      confirmDiscardUnsavedChanges({
        loadingDescription: 'Importing this YAML will replace your current blocks.',
      })
    )) return;
    showImportDebugJson(internal);
    replaceWorkspaceSafely(ws, () => {
      renderAutomationToWorkspace(ws, internal, { clearBefore: true });
    });
    workspaceChangeTracker.markClean();
  } catch (err) {
    console.error(err);
    alert('An error occurred while parsing or normalizing YAML. Check the console for details.');
  }
});


const runCode = () => {
  try {
    latestYamlPreview = generateScopedYamlWithSourceMap(ws);
    console.log('Generated YAML code:', latestYamlPreview.yaml);
    renderYamlPreview(
      codeDiv,
      latestYamlPreview,
      selectedYamlBlockId ? ws.getBlockById(selectedYamlBlockId) : null,
    );
  } catch (error) {
    console.error('Code generation failed:', error);
    codeDiv.innerText = 'Code generation failed: ' + error.message;
  }
};

load(ws);
refreshEntityDropdownSearch();
runCode();

ws.addChangeListener((e) => {
  if (e.isUiEvent) return;
  save(ws);
});

ws.addChangeListener((e) => {
  if (e.type !== Blockly.Events.SELECTED) return;
  selectedYamlBlockId = e.newElementId || null;
  renderYamlPreview(codeDiv, latestYamlPreview, selectedYamlBlockId ? ws.getBlockById(selectedYamlBlockId) : null);
});

ws.addChangeListener((e) => {
  if (
    e.isUiEvent ||
    e.type == Blockly.Events.FINISHED_LOADING ||
    ws.isDragging()
  ) {
    return;
  }
  runCode();
});

setupHaPullPanel({ ws, workspaceChangeTracker });

// Initialise the controls directly once the workspace exists.
const initWorkspaceTools = () => {
  initConflictAnalyzerUI();
  initTaskAltUI({ ws });
  initAiAssistantUI({
    ws,
    renderAutomationToWorkspace: (workspace, automation, options) => {
      replaceWorkspaceSafely(workspace, () => renderAutomationToWorkspace(workspace, automation, options));
    },
    // Conflict analysis must receive the same scoped automation YAML shown in
    // the preview and used by Copy/Export/Push. Otherwise loose workspace
    // chains could be analysed even though they are not output.
    getWorkspaceYaml: () => generateScopedYaml(ws),
    confirmBeforeReplace: (proceed) => workspaceChangeTracker.confirmBeforeReplace(proceed),
  });
  initBlockSearchFlyout({ workspace: ws, entityStateStore });
};
initWorkspaceTools();

}

bootstrap().catch((error) => {
  console.error('[HA-SmartBlock] Startup failed.', error);
});
