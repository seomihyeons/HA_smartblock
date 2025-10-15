/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Blockly from 'blockly';
import {save, load} from './serialization';
import { setupYamlExportButtons } from './export_code';
import { setupYamlImportButton } from './import/import_button';
import { yamlTextToInternalJson } from './import/yaml_import';
import { renderAutomationToWorkspace } from './import/yamlToBlocks';

import './index.css';
import {yamlGenerator} from './generators/yaml';

//toolbox
import {toolbox} from './toolbox';
import { customTheme } from './utils/custom_theme.js';

// blocks
import {ruleBlocks} from './blocks/rule_blocks';

import {haEventStateBlocks} from './blocks/event/event_HA_state'; 
import {eventLightStateBlocks} from './blocks/event/event_light_state';
import {eventBinarySensorStateBlocks} from './blocks/event/event_binary_sensor_state';
import {eventSwitchStateBlocks} from './blocks/event/event_switch_state';
import {eventLockStateBlocks} from './blocks/event/event_lock_state';
import {eventNumericSensorBlocks} from './blocks/event/event_sensor_state';
import {eventForBlocks} from './blocks/event/event_for';
import {haEventSunBlocks} from './blocks/event/event_sun' ;

import {conditionLogicBlocks} from './blocks/condition/condition_logic';
import {conditionStateBlocks} from './blocks/condition/condition_entity_state';
import {conditionNumericStateEntityBlocks} from './blocks/condition/condition_numeric_state_entity';
import {conditionNumericStateAttributeBlocks } from './blocks/condition/condition_numeric_state_attribute';

import {actionEntityBlocks} from './blocks/action/action_entity';
import {actionDelayBlocks} from './blocks/action/action_delay';
import {actionIfBlocks} from './blocks/action/action_if';
import {actionNotifyBlocks} from './blocks/action/action_notify';

// Register the blocks and generator with Blockly
Blockly.common.defineBlocks(ruleBlocks); 

Blockly.common.defineBlocks(haEventStateBlocks);
Blockly.common.defineBlocks(eventLightStateBlocks);
Blockly.common.defineBlocks(eventBinarySensorStateBlocks); 
Blockly.common.defineBlocks(eventSwitchStateBlocks);
Blockly.common.defineBlocks(eventLockStateBlocks);
Blockly.common.defineBlocks(eventNumericSensorBlocks);
Blockly.common.defineBlocks(eventForBlocks);
Blockly.common.defineBlocks(haEventSunBlocks);

Blockly.common.defineBlocks(conditionLogicBlocks); 
Blockly.common.defineBlocks(conditionStateBlocks);
Blockly.common.defineBlocks(conditionNumericStateEntityBlocks);
Blockly.common.defineBlocks(conditionNumericStateAttributeBlocks);

Blockly.common.defineBlocks(actionEntityBlocks);
Blockly.common.defineBlocks(actionDelayBlocks);
Blockly.common.defineBlocks(actionIfBlocks); 
Blockly.common.defineBlocks(actionNotifyBlocks); 

const codeDiv = document.getElementById('generatedCode');
const blocklyDiv = document.getElementById('blocklyDiv');
const ws = Blockly.inject(blocklyDiv, {toolbox, theme: customTheme,});

window.Blockly = Blockly;
window.ws = ws;

setupYamlExportButtons('generatedCode', ws);
setupYamlImportButton({ outputId: 'generatedCode', ws: ws });


document.addEventListener('yaml-imported', (e) => {
  try {
    const yamlText = e.detail.text;
    const internal = yamlTextToInternalJson(yamlText);

    // ① 화면에 내부 JSON 표시
    showImportDebugJson(internal);

    // ② 블록 렌더 시도 (그림이 안 떠도 JSON은 남아 확인 가능)
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
  const host = document.getElementById('generatedCode'); // YAML 미리보기 pre
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

    // YAML 미리보기(#generatedCode) 위에 디버그 패널을 배치
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