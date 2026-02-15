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
import { renderAutomationToWorkspace } from './import/yamlToBlocks';
import './blocks/extensions.js';

import { initConflictAnalyzerUI } from "./homeassistant/conflict_analyzer/debug_ui";

import './index.css';
import { yamlGenerator } from './generators/yaml';

import { toolbox } from './toolbox';
import { customTheme } from './utils/custom_theme.js';

import './blocks/extensions';

import { ruleBlocks } from './blocks/rule_blocks';
import { rawLinesBlocks } from './blocks/raw_lines';
Blockly.common.defineBlocks(rawLinesBlocks);

import { haEventStateBlocks } from './blocks/event/event_HA_state';
import { eventEntityBlocks } from './blocks/event/event_entity.js';
import { eventNumericSensorBlocks } from './blocks/event/event_sensor_state';
import { eventTimeStateBlocks } from './blocks/event/event_time_state';
import { eventForBlocks } from './blocks/event/event_for';
import { haEventSunBlocks } from './blocks/event/event_sun';
import { eventSunStateBlocks } from './blocks/event/event_sun_state';

import { conditionLogicBlocks } from './blocks/condition/condition_logic';
import { conditionStateBlocks } from './blocks/condition/condition_entity_state';
import { conditionTimeBlocks } from './blocks/condition/condition_time';
import { conditionNumericStateEntityBlocks } from './blocks/condition/condition_numeric_state_entity';
import { conditionNumericStateAttributeBlocks } from './blocks/condition/condition_numeric_state_attribute';

import { actionEntityBlocks } from './blocks/action/action_entity';
import { actionDelayBlocks } from './blocks/action/action_delay';
import { actionIfBlocks } from './blocks/action/action_if';
import { actionNotifyBlocks } from './blocks/action/action_notify';
import { actionGroupBlocks } from './blocks/action/action.group';
import { actionNotifyTagBlocks } from './blocks/action/action_notify_tag.js';
import { actionDataBlocks } from './blocks/action/action_data.js';

Blockly.common.defineBlocks(ruleBlocks);

Blockly.common.defineBlocks(haEventStateBlocks);
Blockly.common.defineBlocks(eventEntityBlocks);
Blockly.common.defineBlocks(eventNumericSensorBlocks);
Blockly.common.defineBlocks(eventTimeStateBlocks);
Blockly.common.defineBlocks(eventForBlocks);
Blockly.common.defineBlocks(haEventSunBlocks);
Blockly.common.defineBlocks(eventSunStateBlocks);

Blockly.common.defineBlocks(conditionLogicBlocks);
Blockly.common.defineBlocks(conditionStateBlocks);
Blockly.common.defineBlocks(conditionTimeBlocks);
Blockly.common.defineBlocks(conditionNumericStateEntityBlocks);
Blockly.common.defineBlocks(conditionNumericStateAttributeBlocks);

Blockly.common.defineBlocks(actionEntityBlocks);
Blockly.common.defineBlocks(actionDataBlocks);
Blockly.common.defineBlocks(actionDelayBlocks);
Blockly.common.defineBlocks(actionIfBlocks);
Blockly.common.defineBlocks(actionNotifyBlocks);
Blockly.common.defineBlocks(actionGroupBlocks);
Blockly.common.defineBlocks(actionNotifyTagBlocks);

const codeDiv = document.getElementById('generatedCode');
const blocklyDiv = document.getElementById('blocklyDiv');
const ws = Blockly.inject(blocklyDiv, { toolbox, theme: customTheme, });

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
    alert('YAML 파싱/정규화 중 오류가 발생했습니다. 콘솔을 확인하세요.');
  }
});


const runCode = () => {
  try {
    const code = yamlGenerator.workspaceToCode(ws);
    console.log('생성된 YAML 코드:', code);
    codeDiv.innerText = code;
  } catch (error) {
    console.error('코드 생성 실패:', error);
    codeDiv.innerText = '코드 생성 실패: ' + error.message;
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

function ensureImportDebugPanel() {
  const host = document.getElementById('generatedCode');
  if (!host) return null;

  let panel = document.getElementById('importDebugPanel');
  if (!panel) {
    panel = document.createElement('details');
    panel.id = 'importDebugPanel';
    panel.open = true;
    panel.style.marginBottom = '8px';

    const sum = document.createElement('summary');
    sum.textContent = 'Imported JSON (normalized)';

    const pre = document.createElement('pre');
    pre.id = 'importDebugPre';
    pre.style.background = '#111827';
    pre.style.color = '#e5e7eb';
    pre.style.padding = '8px';
    pre.style.marginTop = '6px';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.borderRadius = '6px';

    panel.appendChild(sum);
    panel.appendChild(pre);

    host.parentNode.insertBefore(panel, host);
  }
  return document.getElementById('importDebugPre');
}

function showImportDebugJson(obj) {
  const pre = ensureImportDebugPanel();
  if (!pre) return;
  try {
    pre.textContent = JSON.stringify(obj, null, 2);
  } catch {
    pre.textContent = String(obj);
  }
}

import { pullAutomationIndexWithEditability } from './homeassistant/pull_automation';

(async () => {
  const r = await pullAutomationIndexWithEditability({ concurrency: 3 });

  console.log('ALL=', r.all);
  console.log('editable count=', r.all.filter(x => x.editable).length);
})();

import { setupHaPullPanel } from './homeassistant/ha_pull_panel';

setupHaPullPanel({ ws });



window.addEventListener("DOMContentLoaded", () => {
  initConflictAnalyzerUI();
});
