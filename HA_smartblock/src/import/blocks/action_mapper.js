// src/import/blocks/action_mapper.js
import * as Blockly from 'blockly';
import { createConditionsRoot } from './condition_mapper';
import { createRawLinesBlock } from './raw_fallback.js';

const canCreate = (t) => !!Blockly.Blocks?.[t];
const set = (b, name, v) => { if (name && b.getField(name)) b.setFieldValue(String(v), name); };
const firstField = (b, list) => list.find(n => n && b.getField(n)) || null;

// 단일/배열/없음 → 배열 통일
function toArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

// dropdown(field_dropdown)에 set을 시도한 뒤, 실제로 값이 반영됐는지 확인.
// (options에 없는 값을 set하면 Blockly가 기본값으로 떨어질 수 있음)
function setAndVerifyDropdown(block, fieldName, value) {
  if (!block || !fieldName) return false;
  const f = block.getField(fieldName);
  if (!f) return false;

  if (value != null) block.setFieldValue(String(value), fieldName);

  const hasOptions = typeof f.getOptions === 'function';
  if (hasOptions) {
    const opts = f.getOptions().map((o) => String(o?.[1] ?? ''));
    const want = String(value ?? '');
    const cur = String(f.getValue?.() ?? '');
    return opts.includes(want) && cur === want;
  }

  const cur = String(f.getValue?.() ?? '');
  return cur === String(value ?? '');
}

function appendStmt(parent, child, inputName) {
  const input = parent.getInput(inputName);
  if (!input) return;

  const head = input.connection.targetBlock();
  if (!head) {
    input.connection.connect(child.previousConnection ?? child.outputConnection);
    return;
  }

  let tail = head;
  while (tail.nextConnection && tail.nextConnection.targetBlock()) {
    tail = tail.nextConnection.targetBlock();
  }
  if (tail.nextConnection) {
    tail.nextConnection.connect(child.previousConnection ?? child.outputConnection);
  }
}

// next 체인 연결 유틸
function connectNextChain(prevBlock, nextBlock) {
  if (!prevBlock || !nextBlock) return;
  const nextConn = prevBlock.nextConnection;
  const prevConn = nextBlock.previousConnection ?? nextBlock.outputConnection;
  if (nextConn && prevConn && !nextConn.targetConnection) {
    nextConn.connect(prevConn);
  }
}

// dropdown 옵션에 값이 없으면 임시 옵션을 주입해서라도 값 보존(import fidelity)
function setDropdownAllowUnknown(block, fieldName, value) {
  if (!block || !fieldName) return false;
  const f = block.getField(fieldName);
  if (!f) return false;

  if (setAndVerifyDropdown(block, fieldName, value)) return true;

  const want = String(value ?? '');
  const opts = (typeof f.getOptions === 'function' ? f.getOptions() : []).map((o) => [String(o?.[0] ?? ''), String(o?.[1] ?? '')]);
  const has = opts.some(([, v]) => v === want);
  if (!has) {
    f.menuGenerator_ = [...opts, [want, want]];
  }

  block.setFieldValue(want, fieldName);
  return String(f.getValue?.() ?? '') === want;
}

function buildNotifyMessageAsTextBlock(message, notifyBlock, workspace) {
  if (typeof message !== 'string' || !message.length) return;
  if (!canCreate('action_notify_message_text')) return;
  const textBlk = workspace.newBlock('action_notify_message_text');
  textBlk.setFieldValue(message, 'TEXT');
  textBlk.initSvg(); textBlk.render();
  appendStmt(notifyBlock, textBlk, 'MESSAGE_BLOCKS');
}

/**
 * notify의 nested payload(a.data.data)를 action_notify 아래에 붙임
 */
function buildNotifyTagBlocks(nested, notifyBlock, workspace) {
  if (!nested || typeof nested !== 'object') return;
  if (!canCreate('action_notify_tag')) return;

  const tagName = nested.tag ?? '';
  const entityId = nested.entity_id ?? '';
  const actions = Array.isArray(nested.actions) ? nested.actions : [];

  // (1) action_notify_tag 껍데기
  const tagBlk = workspace.newBlock('action_notify_tag');
  if (tagBlk.getField('TAG_NAME')) tagBlk.setFieldValue(String(tagName), 'TAG_NAME');
  tagBlk.initSvg(); tagBlk.render();
  appendStmt(notifyBlock, tagBlk, 'MESSAGE_BLOCKS');

  // (2) notify_tag: entity dropdown
  if (canCreate('notify_tag')) {
    const entBlk = workspace.newBlock('notify_tag');
    if (entBlk.getField('ENTITY_ID') && entityId) {
      // dropdown이면 기본값으로 떨어질 수 있으니 검증
      if (!setAndVerifyDropdown(entBlk, 'ENTITY_ID', String(entityId))) {
        // 그냥 텍스트로 남기기(최소 침습)
        entBlk.setFieldValue(String(entityId), 'ENTITY_ID');
      }
    }
    entBlk.initSvg(); entBlk.render();
    appendStmt(tagBlk, entBlk, 'TAG_BLOCKS');
  }

  // (3) actions[]: notify_action + props
  if (actions.length && canCreate('notify_action')) {
    for (const act of actions) {
      if (!act || typeof act !== 'object') continue;

      const actionId = act.action ?? '';
      const title = act.title ?? '';
      const destructive = act.destructive;
      const activationMode = act.activationMode ?? '';

      const aBlk = workspace.newBlock('notify_action');
      if (aBlk.getField('ACTION_ID')) aBlk.setFieldValue(String(actionId), 'ACTION_ID');
      else if (aBlk.getField('TITLE')) aBlk.setFieldValue(String(actionId), 'TITLE');
      aBlk.initSvg(); aBlk.render();
      appendStmt(tagBlk, aBlk, 'TAG_BLOCKS');

      if (title && canCreate('notify_prop_title')) {
        const p = workspace.newBlock('notify_prop_title');
        if (p.getField('TITLE')) p.setFieldValue(String(title), 'TITLE');
        p.initSvg(); p.render();
        appendStmt(tagBlk, p, 'TAG_BLOCKS');
      }

      if (typeof destructive === 'boolean' && canCreate('notify_prop_destructive')) {
        const p = workspace.newBlock('notify_prop_destructive');
        if (p.getField('DESTRUCTIVE')) p.setFieldValue(destructive ? 'true' : 'false', 'DESTRUCTIVE');
        p.initSvg(); p.render();
        appendStmt(tagBlk, p, 'TAG_BLOCKS');
      }

      if (activationMode && canCreate('notify_prop_activationMode')) {
        const p = workspace.newBlock('notify_prop_activationMode');
        if (p.getField('MODE')) p.setFieldValue(String(activationMode), 'MODE');
        p.initSvg(); p.render();
        appendStmt(tagBlk, p, 'TAG_BLOCKS');
      }
    }
  }

}

function buildNotifyPushBlocks(nested, notifyBlock, workspace) {
  if (!nested || typeof nested !== 'object') return;
  const push = (nested.push && typeof nested.push === 'object') ? nested.push : null;
  if (!push || !canCreate('notify_push')) return;

  if (push.sound && typeof push.sound === 'object') {
    const pBlk = workspace.newBlock('notify_push');
    if (pBlk.getField('PUSH_KIND')) pBlk.setFieldValue('sound', 'PUSH_KIND');
    pBlk.initSvg(); pBlk.render();
    appendStmt(notifyBlock, pBlk, 'MESSAGE_BLOCKS');

    if (push.sound.name != null && canCreate('notify_push_name')) {
      const nBlk = workspace.newBlock('notify_push_name');
      if (nBlk.getField('NAME')) nBlk.setFieldValue(String(push.sound.name), 'NAME');
      nBlk.initSvg(); nBlk.render();
      appendStmt(pBlk, nBlk, 'PUSH_BLOCKS');
    }
    if ((push.sound.critical != null || push.sound.volume != null) && canCreate('notify_push_critical')) {
      const cBlk = workspace.newBlock('notify_push_critical');
      if (push.sound.critical != null && cBlk.getField('CRITICAL')) {
        cBlk.setFieldValue(String(push.sound.critical), 'CRITICAL');
      }
      if (push.sound.volume != null && cBlk.getField('VOLUME')) {
        cBlk.setFieldValue(String(push.sound.volume), 'VOLUME');
      }
      cBlk.initSvg(); cBlk.render();
      appendStmt(pBlk, cBlk, 'PUSH_BLOCKS');
    }
  }

  if (push.badge != null && canCreate('notify_push')) {
    const pBlk = workspace.newBlock('notify_push');
    if (pBlk.getField('PUSH_KIND')) pBlk.setFieldValue('badge', 'PUSH_KIND');
    pBlk.initSvg(); pBlk.render();
    appendStmt(notifyBlock, pBlk, 'MESSAGE_BLOCKS');

    if (canCreate('notify_push_critical')) {
      const bBlk = workspace.newBlock('notify_push_critical');
      if (bBlk.getField('CRITICAL')) bBlk.setFieldValue(String(push.badge), 'CRITICAL');
      if (bBlk.getField('VOLUME')) bBlk.setFieldValue('0', 'VOLUME');
      bBlk.initSvg(); bBlk.render();
      appendStmt(pBlk, bBlk, 'PUSH_BLOCKS');
    }
  }
}

function toHMS(v) {
  if (typeof v === 'string') {
    const m = v.match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (m) return { hours: +m[1], minutes: +m[2], seconds: +m[3] };
  }
  if (typeof v === 'number') {
    const s = v | 0;
    return { hours: (s / 3600) | 0, minutes: ((s % 3600) / 60) | 0, seconds: s % 60 };
  }
  return { hours: 0, minutes: 0, seconds: 0 };
}

// group domain + data/target entity_id 리스트 → action_group_entities로 변환
function createGroupActionBlock(a, workspace, domain, method) {
  if (!canCreate('action_group_entities')) {
    console.warn('[import] group action blocks not available');
    return null;
  }

  const b = workspace.newBlock('action_group_entities');

  if (b.getField('DOMAIN') && !setAndVerifyDropdown(b, 'DOMAIN', domain)) {
    b.dispose(false);
    return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
  }
  if (b.getField('SERVICE') && !setAndVerifyDropdown(b, 'SERVICE', method)) {
    b.dispose(false);
    return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
  }
  // Parent should be rendered before children are connected, otherwise
  // initial layout can appear stacked until a user interaction re-renders it.
  b.initSvg(); b.render();

  const entities = toArray(a.target?.entity_id ?? a.data?.entity_id ?? []);
  entities.forEach((eid) => {
    const typed = `action_${domain}`;
    const childType = canCreate(typed) ? typed : (canCreate('action_group_entity_item') ? 'action_group_entity_item' : null);
    if (!childType) return;

    const child = workspace.newBlock(childType);

    if (child.getField('ENTITY_ID')) {
      if (!setDropdownAllowUnknown(child, 'ENTITY_ID', String(eid))) {
        child.dispose(false);
        return;
      }
    }

    if (child.getField('ACTION')) {
      setAndVerifyDropdown(child, 'ACTION', method) || child.setFieldValue(String(method), 'ACTION');
    }

    child.initSvg(); child.render();
    appendStmt(b, child, 'ENTITIES');
  });

  // group의 공통 data는 DATA 입력으로 복원 (entity_id 제외)
  if (a.data && typeof a.data === 'object') {
    const groupData = { ...a.data };
    delete groupData.entity_id;
    if (Object.keys(groupData).length > 0) {
      buildActionDataBlocks(groupData, b, workspace);
    }
  }

  b.render();
  return b;
}

/**
 * ✅ DATA 입력을 강제로 생성(= Show data 상태)
 */
function ensureActionDataInput(block) {
  if (!block) return;
  if (block.getInput('DATA')) return;

  if (typeof block.loadExtraState === 'function') {
    block.loadExtraState({ hasData: true });
    return;
  }

  if ('hasData_' in block) {
    block.hasData_ = true;
    if (typeof block.updateShape_ === 'function') block.updateShape_();
    return;
  }

  try {
    block.appendStatementInput('DATA')
      .setCheck('HA_ACTION_DATA')
      .appendField('data');
  } catch (e) {
    console.warn('[import] failed to ensure DATA input:', e);
  }
}

/**
 * ✅ YAML의 action.data를 "작은 블록들"로 구성해서 DATA에 붙이기
 */
function buildActionDataBlocks(dataObj, actionBlock, workspace) {
  if (!dataObj || typeof dataObj !== 'object') return;
  if (!actionBlock) return;

  const keys = Object.keys(dataObj);
  if (!keys.length) return;

  ensureActionDataInput(actionBlock);
  if (!actionBlock.getInput('DATA')) return;

  const addKv = (k, v) => {
    if (!canCreate('action_data_kv_text')) return;
    const kv = workspace.newBlock('action_data_kv_text');
    if (kv.getField('KEY')) kv.setFieldValue(String(k), 'KEY');
    if (kv.getField('VALUE')) kv.setFieldValue(String(v), 'VALUE');
    kv.initSvg(); kv.render();
    appendStmt(actionBlock, kv, 'DATA');
  };

  if (dataObj.brightness_pct != null && canCreate('action_data_brightness_pct')) {
    const b = workspace.newBlock('action_data_brightness_pct');
    if (b.getField('VALUE')) b.setFieldValue(String(dataObj.brightness_pct), 'VALUE');
    b.initSvg(); b.render();
    appendStmt(actionBlock, b, 'DATA');
  }

  if (dataObj.transition != null && canCreate('action_data_transition')) {
    const t = workspace.newBlock('action_data_transition');
    if (t.getField('SECONDS')) t.setFieldValue(String(dataObj.transition), 'SECONDS');
    t.initSvg(); t.render();
    appendStmt(actionBlock, t, 'DATA');
  }

  if (dataObj.color_name != null && canCreate('action_data_color')) {
    const c = workspace.newBlock('action_data_color');
    if (c.getField('MODE')) c.setFieldValue('name', 'MODE');
    if (c.getField('NAME')) c.setFieldValue(String(dataObj.color_name), 'NAME');
    c.initSvg(); c.render();
    appendStmt(actionBlock, c, 'DATA');
  } else if (Array.isArray(dataObj.rgb_color) && dataObj.rgb_color.length >= 3 && canCreate('action_data_color')) {
    const c = workspace.newBlock('action_data_color');
    if (c.getField('MODE')) c.setFieldValue('rgb', 'MODE');
    if (c.getField('R')) c.setFieldValue(String(Number(dataObj.rgb_color[0]) || 0), 'R');
    if (c.getField('G')) c.setFieldValue(String(Number(dataObj.rgb_color[1]) || 0), 'G');
    if (c.getField('B')) c.setFieldValue(String(Number(dataObj.rgb_color[2]) || 0), 'B');
    c.initSvg(); c.render();
    appendStmt(actionBlock, c, 'DATA');
  }

  let effectHandledByBlock = false;
  if (dataObj.effect != null && canCreate('action_data_effect')) {
    const effect = String(dataObj.effect);
    const preset = ['Daylight', 'Rainbow', 'Colorloop', 'None'];
    if (preset.includes(effect)) {
      effectHandledByBlock = true;
      const e = workspace.newBlock('action_data_effect');
      if (e.getField('EFFECT')) e.setFieldValue(effect, 'EFFECT');
      e.initSvg(); e.render();
      appendStmt(actionBlock, e, 'DATA');
    }
  }

  if (typeof dataObj.announce === 'boolean' && canCreate('action_data_announce')) {
    const n = workspace.newBlock('action_data_announce');
    if (n.getField('VALUE')) n.setFieldValue(dataObj.announce ? 'true' : 'false', 'VALUE');
    n.initSvg(); n.render();
    appendStmt(actionBlock, n, 'DATA');
  }

  if (typeof dataObj.media_content_type === 'string' && canCreate('action_data_media_content_type')) {
    const m = workspace.newBlock('action_data_media_content_type');
    const type = String(dataObj.media_content_type);
    if (m.getField('VALUE')) {
      const opts = typeof m.getField('VALUE')?.getOptions === 'function'
        ? m.getField('VALUE').getOptions().map((o) => o[1])
        : [];
      if (!opts.length || opts.includes(type)) {
        m.setFieldValue(type, 'VALUE');
      }
    }
    m.initSvg(); m.render();
    appendStmt(actionBlock, m, 'DATA');
  }

  for (const [k, v] of Object.entries(dataObj)) {
    if (k === 'brightness_pct' || k === 'transition') continue;
    if (k === 'color_name' || k === 'rgb_color') continue;
    if (k === 'announce' || k === 'media_content_type') continue;
    if (k === 'effect' && effectHandledByBlock) continue;
    if (k === 'entity_id') continue;
    const vv = (typeof v === 'object') ? JSON.stringify(v) : v;
    addKv(k, vv);
  }
}

// ✅ RAW fallback 라인 생성 (읽기 전용 블록에 넣을 텍스트)
function scalarToYaml(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v == null) return 'null';
  return JSON.stringify(v);
}

function appendYamlLines(lines, key, value, indent) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    lines.push(`${pad}${key}:`);
    for (const item of value) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        lines.push(`${pad}  -`);
        for (const [k, v] of Object.entries(item)) {
          appendYamlLines(lines, k, v, indent + 6);
        }
      } else if (Array.isArray(item)) {
        lines.push(`${pad}  - ${JSON.stringify(item)}`);
      } else {
        lines.push(`${pad}  - ${scalarToYaml(item)}`);
      }
    }
    return;
  }

  if (value && typeof value === 'object') {
    lines.push(`${pad}${key}:`);
    for (const [k, v] of Object.entries(value)) {
      appendYamlLines(lines, k, v, indent + 2);
    }
    return;
  }

  lines.push(`${pad}${key}: ${scalarToYaml(value)}`);
}

function actionObjToRawLines(a) {
  if (!a || typeof a !== 'object') return ['- action: {}'];
  const svc = a.action || a.service || '';
  const lines = [];

  if (typeof svc === 'string' && svc.length) {
    lines.push(`- action: ${svc}`);
  } else {
    lines.push(`- action: ${JSON.stringify(a)}`);
    return lines;
  }

  if (a.target && typeof a.target === 'object') {
    lines.push(`  target:`);
    for (const [k, v] of Object.entries(a.target)) {
      appendYamlLines(lines, k, v, 4);
    }
  }

  if (a.data && typeof a.data === 'object') {
    lines.push(`  data:`);
    for (const [k, v] of Object.entries(a.data)) {
      appendYamlLines(lines, k, v, 4);
    }
  }

  return lines;
}

// 템플릿(예: "{{ trigger.entity_id }}")을 dropdown entity_id에 넣으면 기본값으로 떨어짐 → RAW로 보내기
function hasJinjaTemplate(v) {
  if (typeof v !== 'string') return false;
  return /\{\{[^}]*\}\}/.test(v);
}

export function createActionNode(a, workspace) {
  /* ---------- choose/default → if-then/if-else ---------- */
  if (Array.isArray(a?.choose) && a.choose.length > 0) {
    const choice = a.choose[0];
    const hasDefault = !!a.default;
    const TYPE = hasDefault ? 'action_if_else' : 'action_if_then';

    if (!canCreate(TYPE)) {
      return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
    }

    const b = workspace.newBlock(TYPE);

    const conds = Array.isArray(choice.conditions) ? choice.conditions : [];
    const condRoot = createConditionsRoot(conds, workspace);
    if (condRoot) appendStmt(b, condRoot, 'IF');

    const thenItems = Array.isArray(choice.sequence?.items) ? choice.sequence.items : toArray(choice.sequence);
    thenItems.forEach((item) => {
      const child = createActionNode(item, workspace);
      if (child) appendStmt(b, child, 'THEN');
    });

    if (hasDefault) {
      const elseItems = Array.isArray(a.default?.items) ? a.default.items : toArray(a.default);
      elseItems.forEach((item) => {
        const child = createActionNode(item, workspace);
        if (child) appendStmt(b, child, 'ELSE');
      });
    }

    const idField = firstField(b, ['ID', 'Id', 'id']);
    if (idField && a.id != null) b.setFieldValue(String(a.id), idField);
    b.initSvg?.(); b.render?.();
    return b;
  }

  /* ---------- delay ---------- */
  if (a?.delay && canCreate('action_delay')) {
    const n = toHMS(a.delay);
    const b = workspace.newBlock('action_delay');
    set(b, 'H', n.hours); set(b, 'M', n.minutes); set(b, 'S', n.seconds);
    b.initSvg?.(); b.render?.();
    return b;
  }

  /* ---------- notify.* ---------- */
  const svc = a?.action || a?.service;

  if (typeof svc === 'string' && svc.startsWith('notify.')) {
    if (!canCreate('action_notify')) {
      return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
    }

    const uiTarget = svc.replace(/^notify\./, '') || 'notify';
    const message = a?.data?.message ?? a?.data?.notification?.message ?? '';

    const b = workspace.newBlock('action_notify');

    const field = b.getField('TARGET');
    const options = field?.getOptions ? field.getOptions().map(o => o[1]) : [];
    const valueToSet = options.includes(uiTarget) ? uiTarget : 'notify';
    b.setFieldValue(valueToSet, 'TARGET');

    b.initSvg(); b.render();
    buildNotifyMessageAsTextBlock(String(message ?? ''), b, workspace);

    // nested payload: data.data
    const nested = a?.data?.data;
    if (nested) {
      buildNotifyPushBlocks(nested, b, workspace);
      buildNotifyTagBlocks(nested, b, workspace);
    }

    return b;
  }

  /* ---------- 기타 도메인 ---------- */
  if (typeof svc !== 'string') {
    return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
  }

  const [domain, method] = svc.split('.');

  // 0) target.entity_id가 템플릿이면, dropdown에 못 넣으니 RAW로
  const targetEntity = a?.target?.entity_id;
  if (typeof targetEntity === 'string' && hasJinjaTemplate(targetEntity)) {
    return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
  }
  if (Array.isArray(targetEntity) && targetEntity.some(v => typeof v === 'string' && hasJinjaTemplate(v))) {
    return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
  }

  // 1) group domain + data/target entity_id 리스트 → group 블록
  const supportsGroup = ['cover', 'light', 'switch', 'fan', 'media_player'].includes(domain);
  const groupEntities = toArray(a.data?.entity_id ?? a.target?.entity_id);
  if (supportsGroup && groupEntities.length > 1) {
    const groupBlock = createGroupActionBlock(a, workspace, domain, method);
    if (groupBlock) return groupBlock;
  }

  // 2) single entity 액션: action_<domain> 블록이 있으면 동적으로 사용
  const TYPE = `action_${domain}`;
  if (!TYPE || !canCreate(TYPE)) {
    return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
  }

  const entityIds = toArray(a.target?.entity_id ?? a.entity_id ?? a.data?.entity_id);
  const dataObj = a.data ?? null;

  const makeOne = (eid) => {
    const blk = workspace.newBlock(TYPE);

    // 서비스(method) dropdown이면 검증 실패 시 RAW로
    const serviceField = firstField(blk, ['ACTION', 'SERVICE']);
    if (serviceField) {
      if (!setAndVerifyDropdown(blk, serviceField, method)) {
        return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
      }
    }

    // entity dropdown이면 검증 실패 시 RAW로
    const entityField = firstField(blk, ['ENTITY', 'ENTITY_ID']);
    if (entityField) {
      if (!setDropdownAllowUnknown(blk, entityField, eid ?? '')) {
        return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
      }
    }

    // data 있으면 "Show data" + 내부 블록 구성
    if (dataObj && typeof dataObj === 'object' && Object.keys(dataObj).length) {
      buildActionDataBlocks(dataObj, blk, workspace);
    }

    blk.initSvg?.();
    blk.render?.();
    return blk;
  };

  if (entityIds.length > 1) {
    const head = makeOne(entityIds[0]);
    // head가 RAW면 체인 못 잇는 케이스가 있어서 그냥 head 반환(우선 의미 보존)
    if (!head || head.type?.includes?.('raw')) return head;

    let tail = head;
    for (let i = 1; i < entityIds.length; i++) {
      const nb = makeOne(entityIds[i]);
      if (!nb || nb.type?.includes?.('raw')) return head;
      connectNextChain(tail, nb);
      tail = nb;
    }
    return head;
  }

  return makeOne(entityIds[0] ?? '');
}
