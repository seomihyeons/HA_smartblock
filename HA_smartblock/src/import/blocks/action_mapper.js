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

function getActionEntityIdsForGroup(a) {
  const normalize = (arr) =>
    toArray(arr)
      .map((v) => String(v ?? '').trim())
      .filter((v) => v.length > 0);

  const targetIds = normalize(a?.target?.entity_id);
  const dataIds = normalize(a?.data?.entity_id);
  const topLevelIds = normalize(a?.entity_id);

  // Prefer explicit target list when it is truly a group.
  if (targetIds.length > 1) return targetIds;
  if (dataIds.length > 1) return dataIds;
  if (topLevelIds.length > 1) return topLevelIds;
  if (targetIds.length) return targetIds;
  if (dataIds.length) return dataIds;
  return topLevelIds;
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
  const entityRaw = nested.entity_id ?? '';
  const entityId = Array.isArray(entityRaw) ? String(entityRaw[0] || '') : String(entityRaw || '');
  const actions = Array.isArray(nested.actions) ? nested.actions : [];

  // (1) action_notify_tag 껍데기
  const tagBlk = workspace.newBlock('action_notify_tag');
  if (tagBlk.getField('TAG_NAME')) tagBlk.setFieldValue(String(tagName), 'TAG_NAME');
  const needsDetails = !!entityId || actions.length > 0;
  if (needsDetails) {
    if (typeof tagBlk.loadExtraState === 'function') {
      tagBlk.loadExtraState({ hasDetails: true });
    } else if ('hasDetails_' in tagBlk) {
      tagBlk.hasDetails_ = true;
      if (typeof tagBlk.updateShape_ === 'function') tagBlk.updateShape_();
    }
  }
  tagBlk.initSvg(); tagBlk.render();
  appendStmt(notifyBlock, tagBlk, 'MESSAGE_BLOCKS');

  // (2) notify_tag: entity dropdown
  if (entityId && canCreate('notify_tag')) {
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
  const hasPushKey = Object.prototype.hasOwnProperty.call(nested, 'push');
  const push = (nested.push && typeof nested.push === 'object') ? nested.push : null;
  const makePushOptionBlock = (option, soundMode = null) => {
    const blk = workspace.newBlock('notify_push_option');
    blk.initSvg(); blk.render();

    if (blk.getField('OPTION')) blk.setFieldValue(String(option), 'OPTION');

    // Ensure dynamic input row exists for programmatic imports.
    if (typeof blk.rebuildNotifyPushOption_ === 'function') {
      if (soundMode != null) blk.__soundMode = String(soundMode);
      blk.rebuildNotifyPushOption_();
    }

    if (soundMode != null && blk.getField('SOUND_MODE')) {
      blk.setFieldValue(String(soundMode), 'SOUND_MODE');
    }

    return blk;
  };

  if (canCreate('notify_push_option')) {
    if (hasPushKey && nested.push == null) {
      const noneBlk = makePushOptionBlock('none');
      appendStmt(notifyBlock, noneBlk, 'MESSAGE_BLOCKS');
      return;
    }
    if (!hasPushKey || !push) return;

    if (typeof push.sound === 'string') {
      const mode = (push.sound === 'default' || push.sound === 'none') ? push.sound : 'text';
      const sBlk = makePushOptionBlock('sound', mode);
      if (sBlk.getField('SOUND_MODE')) sBlk.setFieldValue(mode, 'SOUND_MODE');
      if (mode === 'text' && sBlk.getField('SOUND_TEXT')) sBlk.setFieldValue(String(push.sound), 'SOUND_TEXT');
      appendStmt(notifyBlock, sBlk, 'MESSAGE_BLOCKS');
    } else if (push.sound && typeof push.sound === 'object') {
      const sBlk = makePushOptionBlock('sound', 'critical');
      if (sBlk.getField('SOUND_MODE')) sBlk.setFieldValue('critical', 'SOUND_MODE');
      if (sBlk.getField('SOUND_NAME') && push.sound.name != null) sBlk.setFieldValue(String(push.sound.name), 'SOUND_NAME');
      if (sBlk.getField('SOUND_CRITICAL') && push.sound.critical != null) sBlk.setFieldValue(String(push.sound.critical), 'SOUND_CRITICAL');
      if (sBlk.getField('SOUND_VOLUME') && push.sound.volume != null) sBlk.setFieldValue(String(push.sound.volume), 'SOUND_VOLUME');
      appendStmt(notifyBlock, sBlk, 'MESSAGE_BLOCKS');
    }

    if (push.badge != null) {
      const bBlk = makePushOptionBlock('badge');
      if (bBlk.getField('BADGE')) bBlk.setFieldValue(String(push.badge), 'BADGE');
      appendStmt(notifyBlock, bBlk, 'MESSAGE_BLOCKS');
    }

    const level = push['interruption-level'];
    if (typeof level === 'string' && level) {
      const iBlk = makePushOptionBlock('interruption_level');
      if (iBlk.getField('INTERRUPTION_LEVEL')) iBlk.setFieldValue(level, 'INTERRUPTION_LEVEL');
      appendStmt(notifyBlock, iBlk, 'MESSAGE_BLOCKS');
    }
    return;
  }

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

  if (push.badge != null) {
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
  if (v && typeof v === 'object') {
    // Home Assistant delay object: {days?, hours?, minutes?, seconds?}
    const toNum = (x) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
    };
    const total = Math.max(
      0,
      Math.floor(
        toNum(v.days) * 86400 +
        toNum(v.hours) * 3600 +
        toNum(v.minutes) * 60 +
        toNum(v.seconds)
      )
    );
    return {
      hours: (total / 3600) | 0,
      minutes: ((total % 3600) / 60) | 0,
      seconds: total % 60,
    };
  }
  return { hours: 0, minutes: 0, seconds: 0 };
}

// group domain + data/target entity_id 리스트 → action_group_entities로 변환
function createGroupActionBlock(a, workspace, domain, method, entitiesOverride = null) {
  if (!canCreate('action_group_entities')) {
    console.warn('[import] group action blocks not available');
    return null;
  }

  const b = workspace.newBlock('action_group_entities');

  if (b.getField('DOMAIN') && !setDropdownAllowUnknown(b, 'DOMAIN', domain)) {
    b.dispose(false);
    return null;
  }
  // Group block should preserve imported service even if dropdown catalog is incomplete.
  if (b.getField('SERVICE') && !setDropdownAllowUnknown(b, 'SERVICE', method)) {
    b.dispose(false);
    return null;
  }
  // Parent should be rendered before children are connected, otherwise
  // initial layout can appear stacked until a user interaction re-renders it.
  b.initSvg(); b.render();

  let addedEntities = 0;
  const entities = Array.isArray(entitiesOverride)
    ? entitiesOverride
    : toArray(a.target?.entity_id ?? a.data?.entity_id ?? a.entity_id ?? []);
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
      setDropdownAllowUnknown(child, 'ACTION', method) || child.setFieldValue(String(method), 'ACTION');
    }

    child.initSvg(); child.render();
    appendStmt(b, child, 'ENTITIES');
    addedEntities += 1;
  });

  if (!addedEntities) {
    b.dispose(false);
    return null;
  }

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

function normalizeMqttPayloadValue(raw) {
  if (typeof raw !== 'string') return String(raw ?? '');
  let s = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < 3; i += 1) {
    const prev = s;
    s = s
      .replace(/\\\\n/g, '\\n')
      .replace(/\\\\r/g, '\\r')
      .replace(/\\\\t/g, '\\t')
      .replace(/\\\\\"/g, '\\"')
      .replace(/\\\\x([0-9a-fA-F]{2})/g, '\\x$1')
      .replace(/\\\\u([0-9a-fA-F]{4})/g, '\\u$1');
    if (s === prev) break;
  }

  s = s
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/''/g, "'")
    .replace(/"\s*\\\s*:/g, '":');

  return s;
}

function buildActionMqttDataBlocks(dataObj, actionBlock, workspace) {
  if (!dataObj || typeof dataObj !== 'object' || Array.isArray(dataObj)) return;
  if (!actionBlock) return;
  if (!Object.keys(dataObj).length) return;

  ensureActionDataInput(actionBlock);
  if (!actionBlock.getInput('DATA')) return;

  const addKv = (k, v) => {
    if (!canCreate('action_mqtt_data_kv')) return;
    const kv = workspace.newBlock('action_mqtt_data_kv');
    if (kv.getField('KEY')) kv.setFieldValue(String(k), 'KEY');
    if (kv.getField('VALUE')) kv.setFieldValue(String(v), 'VALUE');
    kv.initSvg(); kv.render();
    appendStmt(actionBlock, kv, 'DATA');
  };

  for (const [k, v] of Object.entries(dataObj)) {
    const keyLower = String(k || '').trim().toLowerCase();

    if (keyLower === 'payload' && canCreate('action_mqtt_payload_text')) {
      const payload = workspace.newBlock('action_mqtt_payload_text');
      if (payload.getField('PAYLOAD')) {
        payload.setFieldValue(normalizeMqttPayloadValue(v), 'PAYLOAD');
      }
      payload.initSvg(); payload.render();
      appendStmt(actionBlock, payload, 'DATA');
      continue;
    }

    if (keyLower === 'qos' && canCreate('action_mqtt_qos')) {
      const raw = String(v ?? '').trim();
      const qos = raw === '1' || raw === '2' ? raw : '0';
      const qosBlock = workspace.newBlock('action_mqtt_qos');
      if (qosBlock.getField('QOS')) qosBlock.setFieldValue(qos, 'QOS');
      qosBlock.initSvg(); qosBlock.render();
      appendStmt(actionBlock, qosBlock, 'DATA');
      continue;
    }

    if (keyLower === 'retain' && canCreate('action_mqtt_retain')) {
      const retainVal = String(v).toLowerCase() === 'true' ? 'true' : 'false';
      const retainBlock = workspace.newBlock('action_mqtt_retain');
      if (retainBlock.getField('RETAIN')) retainBlock.setFieldValue(retainVal, 'RETAIN');
      retainBlock.initSvg(); retainBlock.render();
      appendStmt(actionBlock, retainBlock, 'DATA');
      continue;
    }

    if (keyLower === 'evaluate_payload' && canCreate('action_mqtt_evaluate_payload')) {
      const evalVal = String(v).toLowerCase() === 'true' ? 'true' : 'false';
      const evalBlock = workspace.newBlock('action_mqtt_evaluate_payload');
      if (evalBlock.getField('EVAL')) evalBlock.setFieldValue(evalVal, 'EVAL');
      evalBlock.initSvg(); evalBlock.render();
      appendStmt(actionBlock, evalBlock, 'DATA');
      continue;
    }

    const valueText = (v && typeof v === 'object') ? JSON.stringify(v) : String(v ?? '');
    addKv(k, valueText);
  }
}

function createMqttPublishActionBlock(a, workspace) {
  if (!canCreate('action_mqtt_publish')) return null;

  const parsed = asPlainObjectMaybe(a?.data);
  const dataObj = parsed ? { ...parsed } : {};
  const topic = String(dataObj.topic ?? '').trim();
  if (!topic) return null;

  const block = workspace.newBlock('action_mqtt_publish');
  if (block.getField('TOPIC')) block.setFieldValue(topic, 'TOPIC');

  delete dataObj.topic;
  const hasData = Object.keys(dataObj).length > 0;
  if (hasData && typeof block.loadExtraState === 'function') {
    const current = block.saveExtraState?.() || {};
    block.loadExtraState({ ...current, hasData: true });
  }

  block.initSvg?.();
  block.render?.();

  if (hasData) {
    buildActionMqttDataBlocks(dataObj, block, workspace);
  }

  block.render?.();
  return block;
}

/**
 * ✅ YAML의 action.data를 "작은 블록들"로 구성해서 DATA에 붙이기
 */
function buildActionDataBlocks(dataObj, actionBlock, workspace) {
  if (!dataObj || typeof dataObj !== 'object') return;
  if (!actionBlock) return;

  if (!Object.keys(dataObj).length) return;

  ensureActionDataInput(actionBlock);
  if (!actionBlock.getInput('DATA')) return;

  const addKv = (k, v, mode = 'text') => {
    if (!canCreate('action_data_kv_text')) return;
    const kv = workspace.newBlock('action_data_kv_text');
    if (kv.getField('KEY')) kv.setFieldValue(String(k), 'KEY');
    if (kv.getField('VALUE')) kv.setFieldValue(String(v), 'VALUE');
    if (kv.getField('VALUE_MODE')) kv.setFieldValue(String(mode), 'VALUE_MODE');
    kv.initSvg(); kv.render();
    appendStmt(actionBlock, kv, 'DATA');
  };

  const normalizePayloadValue = (raw) => {
    if (typeof raw !== 'string') return String(raw ?? '');
    let s = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 중첩 escape(\\n, \\\" 등)를 단계적으로 평탄화
    for (let i = 0; i < 3; i += 1) {
      const prev = s;
      s = s
        .replace(/\\\\n/g, '\\n')
        .replace(/\\\\r/g, '\\r')
        .replace(/\\\\t/g, '\\t')
        .replace(/\\\\\"/g, '\\"')
        .replace(/\\\\x([0-9a-fA-F]{2})/g, '\\x$1')
        .replace(/\\\\u([0-9a-fA-F]{4})/g, '\\u$1');
      if (s === prev) break;
    }

    // \xB0, \u00B0 같은 escape를 실제 문자로 복원
    s = s
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

    // 흔한 escape를 텍스트 값으로 복원
    s = s
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/''/g, "'");

    // 오염 패턴 보정: "pushIcon"\ : 0  -> "pushIcon": 0
    s = s.replace(/"\s*\\\s*:/g, '":');
    return s;
  };

  const parseRgbLike = (value) => {
    const clamp = (n) => Math.max(0, Math.min(255, Math.round(Number(n))));

    if (Array.isArray(value) && value.length >= 3) {
      const r = Number(value[0]);
      const g = Number(value[1]);
      const b = Number(value[2]);
      if ([r, g, b].every((n) => Number.isFinite(n))) {
        return [clamp(r), clamp(g), clamp(b)];
      }
      return null;
    }

    if (typeof value !== 'string') return null;
    const s = value.trim();
    if (!s) return null;

    const bracket = s.match(/^\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]$/);
    if (bracket) {
      return [clamp(bracket[1]), clamp(bracket[2]), clamp(bracket[3])];
    }

    const csv = s.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (csv) {
      return [clamp(csv[1]), clamp(csv[2]), clamp(csv[3])];
    }

    return null;
  };

  const mediaContentId = dataObj.media_content_id;
  const mediaSource = dataObj['media-source'];
  let mediaSourcePairHandled = false;

  const entries = Object.entries(dataObj);
  for (const [k, v] of entries) {
    if (k === 'entity_id') continue;

    if ((k === 'media_content_id' || k === 'media-source') && mediaContentId === '>' && typeof mediaSource === 'string') {
      if (!mediaSourcePairHandled) {
        const sourceText = mediaSource.startsWith('media-source://')
          ? mediaSource
          : `media-source:${mediaSource}`;
        addKv('media_content_id', sourceText, 'yaml_block');
        mediaSourcePairHandled = true;
      }
      continue;
    }

    if (k === 'payload') {
      addKv(k, normalizePayloadValue(v), 'text');
      continue;
    }

    if (k === 'brightness_pct') {
      if (canCreate('action_data_brightness_pct')) {
        const b = workspace.newBlock('action_data_brightness_pct');
        if (b.getField('VALUE')) b.setFieldValue(String(v), 'VALUE');
        b.initSvg(); b.render();
        appendStmt(actionBlock, b, 'DATA');
      } else {
        addKv(k, v, 'text');
      }
      continue;
    }

    if (k === 'transition') {
      if (canCreate('action_data_transition')) {
        const t = workspace.newBlock('action_data_transition');
        if (t.getField('SECONDS')) t.setFieldValue(String(v), 'SECONDS');
        t.initSvg(); t.render();
        appendStmt(actionBlock, t, 'DATA');
      } else {
        addKv(k, v, 'text');
      }
      continue;
    }

    if (k === 'color_name') {
      if (canCreate('action_data_color')) {
        const c = workspace.newBlock('action_data_color');
        if (c.getField('MODE')) c.setFieldValue('name', 'MODE');
        if (c.getField('NAME')) c.setFieldValue(String(v), 'NAME');
        c.initSvg(); c.render();
        appendStmt(actionBlock, c, 'DATA');
      } else {
        addKv(k, v, 'text');
      }
      continue;
    }

    if (k === 'rgb_color') {
      const rgbTriplet = parseRgbLike(v);
      if (rgbTriplet && canCreate('action_data_color')) {
        const c = workspace.newBlock('action_data_color');
        if (c.getField('MODE')) c.setFieldValue('rgb', 'MODE');
        if (c.getField('R')) c.setFieldValue(String(rgbTriplet[0]), 'R');
        if (c.getField('G')) c.setFieldValue(String(rgbTriplet[1]), 'G');
        if (c.getField('B')) c.setFieldValue(String(rgbTriplet[2]), 'B');
        c.initSvg(); c.render();
        appendStmt(actionBlock, c, 'DATA');
      } else {
        addKv(k, v, 'text');
      }
      continue;
    }

    if (k === 'effect') {
      if (canCreate('action_data_effect')) {
        const effect = String(v);
        const preset = ['Daylight', 'Rainbow', 'Colorloop', 'None'];
        if (preset.includes(effect)) {
          const e = workspace.newBlock('action_data_effect');
          if (e.getField('EFFECT')) e.setFieldValue(effect, 'EFFECT');
          e.initSvg(); e.render();
          appendStmt(actionBlock, e, 'DATA');
        } else {
          addKv(k, v, 'text');
        }
      } else {
        addKv(k, v, 'text');
      }
      continue;
    }

    if (k === 'announce') {
      if (typeof v === 'boolean' && canCreate('action_data_announce')) {
        const n = workspace.newBlock('action_data_announce');
        if (n.getField('VALUE')) n.setFieldValue(v ? 'true' : 'false', 'VALUE');
        n.initSvg(); n.render();
        appendStmt(actionBlock, n, 'DATA');
      } else {
        addKv(k, v, 'text');
      }
      continue;
    }

    if (k === 'media_content_type') {
      if (typeof v === 'string' && canCreate('action_data_media_content_type')) {
        const m = workspace.newBlock('action_data_media_content_type');
        const type = String(v);
        let mapped = false;
        if (m.getField('VALUE')) {
          const opts = typeof m.getField('VALUE')?.getOptions === 'function'
            ? m.getField('VALUE').getOptions().map((o) => o[1])
            : [];
          if (!opts.length || opts.includes(type)) {
            m.setFieldValue(type, 'VALUE');
            mapped = true;
          }
        }
        if (mapped) {
          m.initSvg(); m.render();
          appendStmt(actionBlock, m, 'DATA');
        } else {
          m.dispose(false);
          addKv(k, v, 'text');
        }
      } else {
        addKv(k, v, 'text');
      }
      continue;
    }

    if (k === 'preset_mode') {
      if (typeof v === 'string' && canCreate('action_data_climate_preset_mode')) {
        const p = workspace.newBlock('action_data_climate_preset_mode');
        const mode = String(v);
        if (!setAndVerifyDropdown(p, 'VALUE', mode)) {
          p.dispose(false);
          addKv('preset_mode', mode, 'text');
        } else {
          p.initSvg(); p.render();
          appendStmt(actionBlock, p, 'DATA');
        }
      } else {
        addKv(k, v, 'text');
      }
      continue;
    }

    if (k === 'extra' && v && typeof v === 'object' && !Array.isArray(v)) {
      addKv(k, JSON.stringify(v), 'json_object');
      continue;
    }
    const vv = (typeof v === 'object') ? JSON.stringify(v) : v;
    addKv(k, vv, 'text');
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

function normalizeStringList(raw) {
  return toArray(raw)
    .map((v) => String(v ?? '').trim())
    .filter((v) => v.length > 0);
}

const SCRIPT_SERVICE_METHODS = new Set(['turn_on', 'turn_off', 'toggle', 'reload']);

function asPlainObjectMaybe(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (_) {
      // ignore parse failure
    }
  }
  return null;
}

function mergeScriptDataSources(a) {
  const sources = [
    a?.data,
    a?.service_data,
    a?.data_template,
    a?.service_data_template,
  ];
  let hasAny = false;
  const out = {};
  for (const src of sources) {
    const obj = asPlainObjectMaybe(src);
    if (!obj) continue;
    hasAny = true;
    Object.assign(out, obj);
  }
  return hasAny ? out : {};
}

function ensureActionTargetInput(block) {
  if (!block) return;
  if (block.getInput('TARGET')) return;

  if (typeof block.loadExtraState === 'function') {
    const current = block.saveExtraState?.() || {};
    block.loadExtraState({ ...current, hasTarget: true });
    return;
  }

  if ('hasTarget_' in block) {
    block.hasTarget_ = true;
    if (typeof block.updateShape_ === 'function') block.updateShape_();
    return;
  }
}

function createScriptActionBlock(a, workspace, svc) {
  if (!canCreate('action_script_call')) return null;
  if (typeof svc !== 'string') return null;

  const parts = svc.split('.');
  const domain = parts[0];
  if (domain !== 'script' && domain !== 'python_script') return null;
  const method = parts.slice(1).join('.');
  const methodTrimmed = String(method || '').trim();

  const b = workspace.newBlock('action_script_call');
  const dataObj = mergeScriptDataSources(a);
  const targetIds = normalizeStringList(a?.target?.entity_id ?? dataObj.entity_id ?? a?.entity_id);
  delete dataObj.entity_id;
  const hasData = Object.keys(dataObj).length > 0;

  let mode = 'entity';
  let entityId = '';
  let entityText = 'script.my_script';
  let service = 'turn_on';
  let pythonName = 'main_floor_roomba';

  if (domain === 'python_script') {
    mode = 'python';
    if (!methodTrimmed) {
      b.dispose(false);
      return null;
    }
    pythonName = methodTrimmed;
  } else if (SCRIPT_SERVICE_METHODS.has(methodTrimmed)) {
    mode = 'service';
    service = methodTrimmed;
  } else {
    mode = 'entity';
    entityId = svc;
    entityText = svc;
  }

  if (typeof b.loadExtraState === 'function') {
    b.loadExtraState({
      mode,
      hasTarget: targetIds.length > 0,
      hasData,
      entityId,
      entityText,
      service,
      pythonName,
    });
  }

  if (b.getField('MODE')) {
    b.setFieldValue(mode, 'MODE');
  }
  if (mode === 'python' && b.getField('PYTHON_NAME')) {
    b.setFieldValue(pythonName, 'PYTHON_NAME');
  }
  if (mode === 'service' && b.getField('SERVICE')) {
    setDropdownAllowUnknown(b, 'SERVICE', service) || set(b, 'SERVICE', service);
  }
  if (mode === 'entity' && b.getField('ENTITY_ID')) {
    if (!setDropdownAllowUnknown(b, 'ENTITY_ID', entityId)) {
      b.setFieldValue('__custom__', 'ENTITY_ID');
      if (b.getField('ENTITY_TEXT')) b.setFieldValue(String(entityText), 'ENTITY_TEXT');
    }
  }

  b.initSvg?.();
  b.render?.();

  if (targetIds.length) {
    ensureActionTargetInput(b);
    if (!b.getInput('TARGET')) {
      b.dispose(false);
      return null;
    }
    for (const eid of targetIds) {
      if (!canCreate('action_script_target_entity')) continue;
      const child = workspace.newBlock('action_script_target_entity');
      if (!setDropdownAllowUnknown(child, 'ENTITY_ID', eid)) {
        if (child.getField('ENTITY_ID')) child.setFieldValue('__custom__', 'ENTITY_ID');
        if (child.getField('ENTITY_TEXT')) child.setFieldValue(String(eid), 'ENTITY_TEXT');
      }
      child.initSvg?.(); child.render?.();
      appendStmt(b, child, 'TARGET');
    }
  }

  if (mode === 'python') {
    const finalPythonName = String(b.getFieldValue('PYTHON_NAME') || b.pythonName_ || '').trim();
    if (!finalPythonName) {
      b.dispose(false);
      return null;
    }
  }

  if (hasData) {
    buildActionDataBlocks(dataObj, b, workspace);
  }

  b.render?.();
  return b;
}

function getJoinGroupMembers(rawMembers) {
  let source = rawMembers;
  if (typeof source === 'string') {
    const s = source.trim();
    if (s) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) source = parsed;
      } catch (_) {
        // keep raw string path
      }
    }
  }
  return normalizeStringList(source);
}

function getJoinLeaderEntity(a) {
  const candidates = normalizeStringList(
    a?.target?.entity_id ?? a?.entity_id ?? a?.data?.entity_id
  );
  return candidates.find((eid) => !hasJinjaTemplate(eid)) || '';
}

function createJoinActionBlock(a, workspace, domain, leaderEntity, members) {
  if (!canCreate('action_join')) return null;

  const b = workspace.newBlock('action_join');
  if (b.getField('DOMAIN') && !setDropdownAllowUnknown(b, 'DOMAIN', domain)) {
    b.dispose(false);
    return null;
  }
  if (b.getField('ENTITY_ID') && !setDropdownAllowUnknown(b, 'ENTITY_ID', leaderEntity)) {
    b.dispose(false);
    return null;
  }
  b.initSvg(); b.render();

  let added = 0;
  const childType = `action_${domain}`;
  if (!canCreate(childType)) {
    b.dispose(false);
    return null;
  }

  for (const eid of members) {
    const child = workspace.newBlock(childType);

    if (child.getField('ENTITY_ID')) {
      if (!setDropdownAllowUnknown(child, 'ENTITY_ID', eid)) {
        child.dispose(false);
        continue;
      }
    }

    // Member 블록에서는 ACTION 값은 UI 보조 정보일 뿐이며, join generator는 ENTITY_ID만 읽는다.
    if (child.getField('ACTION')) {
      setDropdownAllowUnknown(child, 'ACTION', 'join');
    }

    child.initSvg(); child.render();
    appendStmt(b, child, 'MEMBERS');
    added += 1;
  }

  if (!added) {
    b.dispose(false);
    return null;
  }

  if (a.data && typeof a.data === 'object' && !Array.isArray(a.data)) {
    const extraData = { ...a.data };
    delete extraData.entity_id;
    delete extraData.group_members;
    if (Object.keys(extraData).length > 0) {
      buildActionDataBlocks(extraData, b, workspace);
    }
  }

  b.render();
  return b;
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
  const delayFromSiblingKeys = (
    a &&
    (a.days != null || a.hours != null || a.minutes != null || a.seconds != null)
  )
    ? { days: a.days, hours: a.hours, minutes: a.minutes, seconds: a.seconds }
    : null;

  const delaySource = (
    a?.delay &&
    typeof a.delay === 'object' &&
    !Array.isArray(a.delay) &&
    Object.keys(a.delay).length === 0 &&
    delayFromSiblingKeys
  )
    ? delayFromSiblingKeys
    : (a?.delay ?? delayFromSiblingKeys);

  if (delaySource != null && canCreate('action_delay')) {
    const n = toHMS(delaySource);
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

  if (typeof svc === 'string' && (svc.startsWith('script.') || svc.startsWith('python_script.'))) {
    const scriptBlock = createScriptActionBlock(a, workspace, svc);
    if (scriptBlock) return scriptBlock;
    return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
  }

  if (svc === 'mqtt.publish') {
    const mqttBlock = createMqttPublishActionBlock(a, workspace);
    if (mqttBlock) return mqttBlock;
    return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
  }

  /* ---------- 기타 도메인 ---------- */
  if (typeof svc !== 'string') {
    return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
  }

  const [domain, method] = svc.split('.');

  // 0) target.entity_id 템플릿 처리
  const targetEntity = a?.target?.entity_id;
  const targetList = toArray(targetEntity);
  const templateTargets = targetList.filter((v) => typeof v === 'string' && hasJinjaTemplate(v));
  if (templateTargets.length > 1) {
    return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
  }
  if (templateTargets.length === 1 && targetList.length > 1) {
    return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
  }
  const templateEntity = templateTargets.length === 1 ? String(templateTargets[0]) : '';

  // 0-1) *.join + data.group_members 배열은 action_join 전용 블록으로 우선 복원
  if (method === 'join') {
    const members = getJoinGroupMembers(a?.data?.group_members);
    if (members.length > 0) {
      const leader = getJoinLeaderEntity(a);
      if (!leader) {
        return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
      }
      if (members.some((v) => hasJinjaTemplate(v))) {
        return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
      }
      const joinBlock = createJoinActionBlock(a, workspace, domain, leader, members);
      if (joinBlock) return joinBlock;
    }
  }

  // 1) group domain + data/target entity_id 리스트 → group 블록
  const groupEntities = getActionEntityIdsForGroup(a);
  if (groupEntities.length > 1) {
    const groupBlock = createGroupActionBlock(a, workspace, domain, method, groupEntities);
    if (groupBlock) return groupBlock;
  }

  // 2) single entity 액션: action_<domain> 블록이 있으면 동적으로 사용
  const TYPE = domain === 'ecobee' ? 'action_ecobee_service' : `action_${domain}`;
  if (!TYPE || !canCreate(TYPE)) {
    return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
  }

  const entityIds = toArray(a.target?.entity_id ?? a.entity_id ?? a.data?.entity_id);
  const dataObj = (a.data && typeof a.data === 'object') ? { ...a.data } : null;
  if (dataObj) delete dataObj.entity_id;

  const makeOne = (eid) => {
    const blk = workspace.newBlock(TYPE);

    // 서비스(method) dropdown이면 검증 실패 시 RAW로
    const serviceField = firstField(blk, ['ACTION', 'SERVICE']);
    if (serviceField) {
      if (!setAndVerifyDropdown(blk, serviceField, method)) {
        blk.dispose(false);
        return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
      }
    }
    if (typeof blk.updateEcobeeEntityUi_ === 'function') {
      blk.updateEcobeeEntityUi_();
    }

    // entity dropdown이면 검증 실패 시 RAW로
    const entityField = firstField(blk, ['ENTITY', 'ENTITY_ID']);
    if (TYPE === 'action_ecobee_service') {
      const eidText = String(eid ?? '');
      const requiredEntityServices = new Set(['create_vacation', 'delete_vacation', 'set_sensors_in_climate']);
      const requireEntity = requiredEntityServices.has(method);

      if (!requireEntity && blk.getField('USE_ENTITY')) {
        blk.setFieldValue(eidText ? 'TRUE' : 'FALSE', 'USE_ENTITY');
        if (typeof blk.updateEcobeeEntityUi_ === 'function') {
          blk.updateEcobeeEntityUi_();
        }
      }

      if ((requireEntity || eidText) && blk.getField('ENTITY_ID')) {
        if (!setDropdownAllowUnknown(blk, 'ENTITY_ID', eidText)) {
          blk.dispose(false);
          return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
        }
      }
    } else if (entityField) {
      const eidText = String(eid ?? '');
      if (templateEntity && eidText === templateEntity) {
        if (!setDropdownAllowUnknown(blk, entityField, '__template__')) {
          blk.dispose(false);
          return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
        }
        if (blk.getField('TEMPLATE_ENTITY')) {
          blk.setFieldValue(templateEntity, 'TEMPLATE_ENTITY');
        }
      } else {
        if (!setDropdownAllowUnknown(blk, entityField, eidText)) {
          blk.dispose(false);
          return createRawLinesBlock(workspace, 'action', actionObjToRawLines(a));
        }
      }
    }

    // data 있으면 "Show data" + 내부 블록 구성
    if (dataObj && Object.keys(dataObj).length) {
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
