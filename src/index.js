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
import { initBlockSearchFlyout } from './block_search_flyout.js';

import './index.css';
import { yamlGenerator } from './generators/yaml';
import { loadStudyRuntimeEntities } from './data/entities_index.js';

import { toolbox } from './toolbox';
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

function showStudyEntityLoadError(error) {
  const message = document.createElement('div');
  message.setAttribute('role', 'alert');
  message.textContent =
    'Study entities could not be loaded from Home Assistant. Entity selectors are empty. ' +
    'Check the Home Assistant connection and reload.';
  message.style.cssText = [
    'position:fixed',
    'top:12px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:10000',
    'max-width:720px',
    'padding:10px 14px',
    'border:1px solid #a33',
    'border-radius:6px',
    'background:#fff3f3',
    'color:#7a1515',
    'font:14px sans-serif',
  ].join(';');
  document.body.prepend(message);
  console.error('[HA-SmartBlock Study] Blockly started with no selectable entities.', error);
}

async function bootstrap() {
  const runtimeEntities = await loadStudyRuntimeEntities();
  if (!runtimeEntities.ok) showStudyEntityLoadError(runtimeEntities.error);

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

const codeDiv = document.getElementById('generatedCode');
const blocklyDiv = document.getElementById('blocklyDiv');
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

window.Blockly = Blockly;
window.ws = ws;

setupYamlExportButtons('generatedCode', ws);
setupYamlImportButton({ outputId: 'generatedCode', ws: ws });


document.addEventListener('yaml-imported', (e) => {
  try {
    const yamlText = e.detail.text;
    const internal = yamlTextToInternalJson(yamlText);

    showImportDebugJson(internal);

    renderAutomationToWorkspace(ws, internal, { clearBefore: true });
  } catch (err) {
    console.error(err);
    alert('An error occurred while parsing or normalizing YAML. Check the console for details.');
  }
});


const runCode = () => {
  try {
    const code = yamlGenerator.workspaceToCode(ws);
    console.log('Generated YAML code:', code);
    codeDiv.innerText = code;
  } catch (error) {
    console.error('Code generation failed:', error);
    codeDiv.innerText = 'Code generation failed: ' + error.message;
  }
};

load(ws);
runCode();

ws.addChangeListener((e) => {
  if (e.isUiEvent) return;
  save(ws);
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

setupHaPullPanel({ ws });



// index.js is loaded at the end of <body>, so the required DOM already exists.
  // Initialise these controls directly after the async HA entity bootstrap.
  // Waiting for DOMContentLoaded here is race-prone because the event may have
  // fired while loadStudyRuntimeEntities() was awaiting the network response.
  initConflictAnalyzerUI();
  initTaskAltUI({ ws });
  initBlockSearchFlyout({ workspace: ws });

}

bootstrap().catch((error) => {
  console.error('[HA-SmartBlock Study] Initialization failed.', error);
  showStudyEntityLoadError(error);
});
