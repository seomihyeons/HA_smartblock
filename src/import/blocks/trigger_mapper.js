// src/import/blocks/trigger_mapper.js
import * as Blockly from 'blockly';
import { createRawLinesBlock } from './raw_fallback.js';

const canCreate = (t) => !!Blockly.Blocks?.[t];
const set = (b, name, v) => { if (b && name && b.getField(name) && v != null) b.setFieldValue(String(v), name); };
const firstField = (b, list) => list.find(n => n && b.getField(n)) || null;

// 단일/배열/없음 → 배열 통일
function toArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function parseOffsetHMS(v) {
  if (typeof v !== 'string') return null;
  const m = v.match(/^([+-])?(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return { sign: (m[1] === '-') ? '-' : '+', hours: +m[2], minutes: +m[3], seconds: +m[4] };
}

function setIdIfPresent(block, obj) {
  if (!block || !obj || obj.id == null) return;
  if (block.getField('USE_ID')) {
    block.setFieldValue('TRUE', 'USE_ID');
  }
  const f = firstField(block, ['ID', 'Id', 'id']);
  if (f) block.setFieldValue(String(obj.id), f);
}

// next 체인 연결
function connectNextChain(prevBlock, nextBlock) {
  if (!prevBlock || !nextBlock) return;
  const nextConn = prevBlock.nextConnection;
  const prevConn = nextBlock.previousConnection ?? nextBlock.outputConnection;
  if (nextConn && prevConn && !nextConn.targetConnection) nextConn.connect(prevConn);
}

/* ====== helpers ====== */

function z2(n) { return String(Math.max(0, Number(n) || 0)).padStart(2, '0'); }
function toHMSString(forObj) {
  if (!forObj || typeof forObj !== 'object') return null;
  return `${z2(forObj.hours)}:${z2(forObj.minutes)}:${z2(forObj.seconds)}`;
}

// dropdown(field_dropdown)에 set을 시도한 뒤, 실제로 값이 반영됐는지 확인.
// (options에 없는 값을 set하면 Blockly가 기본값으로 떨어질 수 있음)
function setAndVerifyDropdown(block, fieldName, value, { allowUnknown = false } = {}) {
  if (!block || !fieldName) return false;
  const f = block.getField(fieldName);
  if (!f) return false;

  const hasOptions = typeof f.getOptions === 'function';
  if (hasOptions) {
    const want = String(value ?? '');
    let opts = f.getOptions().map((o) => String(o?.[1] ?? ''));

    if (want === '') {
      block.setFieldValue('', fieldName);
      const cur = String(f.getValue?.() ?? '');
      return cur === '';
    }

    if (allowUnknown && want && !opts.includes(want)) {
      const rawOpts = f.getOptions();
      f.menuGenerator_ = [...rawOpts, [want, want]];
      opts = f.getOptions().map((o) => String(o?.[1] ?? ''));
    }
    block.setFieldValue(want, fieldName);
    const cur = String(f.getValue?.() ?? '');

    return opts.includes(want) && cur === want;
  }

  if (value != null) block.setFieldValue(String(value), fieldName);
  const cur = String(f.getValue?.() ?? '');
  return cur === String(value ?? '');
}

function parseAtTime(v) {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3] ?? '0');
  if (Number.isNaN(hh) || Number.isNaN(mm) || Number.isNaN(ss)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return null;
  return { hh, mm, ss };
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isScalar(v) {
  return ['string', 'number', 'boolean'].includes(typeof v) || v == null;
}

// RAW 블록이 아직 등록 안 된 상태에서도 앱이 죽지 않게 보호
function safeRaw(workspace, kind, lines) {
  try {
    return createRawLinesBlock(workspace, kind, lines);
  } catch (e) {
    console.warn('[import] createRawLinesBlock failed:', e);
    return null;
  }
}

// RAW fallback로 넘어갈 때 기존에 만든 block이 있으면 정리
function disposeIfPossible(b) {
  try { b?.dispose?.(false); } catch (_) {}
}

function toYamlScalar(v) {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v == null) return 'null';
  const s = String(v);
  if (/^[A-Za-z0-9_.:-]+$/.test(s)) return s;
  return JSON.stringify(s);
}

function emitYamlKey(lines, key, value, indent, isFirst) {
  const pad = ' '.repeat(indent);
  const leader = isFirst ? '- ' : pad;

  if (Array.isArray(value)) {
    lines.push(`${leader}${key}:`);
    for (const item of value) {
      const itemPad = ' '.repeat(indent + 2);
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const entries = Object.entries(item);
        if (!entries.length) {
          lines.push(`${itemPad}- {}`);
        } else {
          const [ik, iv] = entries[0];
          emitYamlKey(lines, ik, iv, indent + 2, true);
          for (let i = 1; i < entries.length; i++) {
            emitYamlKey(lines, entries[i][0], entries[i][1], indent + 2, false);
          }
        }
      } else {
        lines.push(`${itemPad}- ${toYamlScalar(item)}`);
      }
    }
    return;
  }

  if (value && typeof value === 'object') {
    lines.push(`${leader}${key}:`);
    emitYamlObject(lines, value, indent + 2);
    return;
  }

  lines.push(`${leader}${key}: ${toYamlScalar(value)}`);
}

function emitYamlObject(lines, obj, indent) {
  for (const [k, v] of Object.entries(obj || {})) {
    emitYamlKey(lines, k, v, indent, false);
  }
}

function triggerToRawLines(t) {
  if (!t || typeof t !== 'object') return ['- ' + JSON.stringify(t)];
  const entries = Object.entries(t);
  if (!entries.length) return ['- {}'];
  const [firstK, firstV] = entries[0];
  const lines = [];
  emitYamlKey(lines, firstK, firstV, 2, true);
  for (let i = 1; i < entries.length; i++) {
    emitYamlKey(lines, entries[i][0], entries[i][1], 2, false);
  }
  return lines;
}

/* ========== 개별 트리거 블록 생성기들 ========== */

// state 패밀리: 엔티티 1개 기준 블록 생성 (통합: event_${domain}_state)
function makeStateTriggerBlock(workspace, t, eid) {
  const domain = eid ? String(eid).split('.')[0] : null;
  const TYPE = domain ? `event_${domain}_state` : null;

  const fromVal =
    t.from === undefined || t.from === null || t.from === ''
      ? ''
      : String(t.from);

  const toVal =
    t.to === undefined || t.to === null || t.to === ''
      ? ''
      : String(t.to);

  const forStr = toHMSString(t.for);

  // 지원 블록 없으면 RAW
  if (!TYPE || !canCreate(TYPE)) {
    return safeRaw(workspace, 'event', [
      `- trigger: state`,
      ...(eid ? [`  entity_id: ${eid}`] : (t.entity ? [`  entity_id: ${t.entity}`] : [])),
      ...(fromVal ? [`  from: '${fromVal}'`] : []),
      ...(toVal ? [`  to: '${toVal}'`] : []),
      ...(forStr ? [`  for: "${forStr}"`] : []),
    ]);
  }

  const b = workspace.newBlock(TYPE);

  // ENTITY_ID (dropdown) 세팅 검증: 실패하면 RAW로
  const entityToSet = eid || t.entity || '';
  const okEntity = setAndVerifyDropdown(b, 'ENTITY_ID', entityToSet, { allowUnknown: true });
  if (!okEntity) {
    disposeIfPossible(b);
    return safeRaw(workspace, 'event', [
      `- trigger: state`,
      ...(entityToSet ? [`  entity_id: ${entityToSet}`] : []),
      ...(fromVal ? [`  from: '${fromVal}'`] : []),
      ...(toVal ? [`  to: '${toVal}'`] : []),
      ...(forStr ? [`  for: "${forStr}"`] : []),
    ]);
  }

  // FROM / TO도 dropdown일 수 있음 → 검증 실패 시 RAW로
  if (!setAndVerifyDropdown(b, 'FROM', fromVal, { allowUnknown: true })) {
    disposeIfPossible(b);
    return safeRaw(workspace, 'event', [
      `- trigger: state`,
      ...(entityToSet ? [`  entity_id: ${entityToSet}`] : []),
      ...(fromVal ? [`  from: '${fromVal}'`] : []),
      ...(toVal ? [`  to: '${toVal}'`] : []),
      ...(forStr ? [`  for: "${forStr}"`] : []),
    ]);
  }
  if (!setAndVerifyDropdown(b, 'TO', toVal, { allowUnknown: true })) {
    disposeIfPossible(b);
    return safeRaw(workspace, 'event', [
      `- trigger: state`,
      ...(entityToSet ? [`  entity_id: ${entityToSet}`] : []),
      ...(fromVal ? [`  from: '${fromVal}'`] : []),
      ...(toVal ? [`  to: '${toVal}'`] : []),
      ...(forStr ? [`  for: "${forStr}"`] : []),
    ]);
  }

  // FOR (값 블록)
  if (t.for && canCreate('ha_event_for_hms') && b.getInput && b.getInput('FOR')) {
    const sub = workspace.newBlock('ha_event_for_hms');
    set(sub, 'H', t.for.hours ?? 0);
    set(sub, 'M', t.for.minutes ?? 0);
    set(sub, 'S', t.for.seconds ?? 0);
    sub.initSvg(); sub.render();
    b.getInput('FOR').connection.connect(sub.outputConnection);
  }

  b.initSvg?.(); b.render?.();
  return b;
}

// numeric_state: 엔티티 1개 기준 블록 생성 (통합: event_sensor_numeric_state)
function makeNumericStateTriggerBlock(workspace, t, eid) {
  const TYPE = 'event_sensor_numeric_state';
  const forStr = toHMSString(t.for);

  if (!canCreate(TYPE)) {
    return safeRaw(workspace, 'event', [
      `- trigger: numeric_state`,
      ...(eid ? [`  entity_id: ${eid}`] : (t.entity ? [`  entity_id: ${t.entity}`] : [])),
      ...(t.above != null ? [`  above: ${t.above}`] : []),
      ...(t.below != null ? [`  below: ${t.below}`] : []),
      ...(forStr ? [`  for: "${forStr}"`] : []),
    ]);
  }

  const b = workspace.newBlock(TYPE);

  // ENTITY_ID (dropdown) 세팅 검증 실패 → RAW
  const entityToSet = eid || t.entity || '';
  const okEntity = setAndVerifyDropdown(b, 'ENTITY_ID', entityToSet);
  if (!okEntity) {
    disposeIfPossible(b);
    return safeRaw(workspace, 'event', [
      `- trigger: numeric_state`,
      ...(entityToSet ? [`  entity_id: ${entityToSet}`] : []),
      ...(t.above != null ? [`  above: ${t.above}`] : []),
      ...(t.below != null ? [`  below: ${t.below}`] : []),
      ...(forStr ? [`  for: "${forStr}"`] : []),
    ]);
  }

  set(b, 'ABOVE', t.above);
  set(b, 'BELOW', t.below);

  if (t.for && canCreate('ha_event_for_hms') && b.getInput && b.getInput('FOR')) {
    const sub = workspace.newBlock('ha_event_for_hms');
    set(sub, 'H', t.for.hours ?? 0);
    set(sub, 'M', t.for.minutes ?? 0);
    set(sub, 'S', t.for.seconds ?? 0);
    sub.initSvg(); sub.render();
    b.getInput('FOR').connection.connect(sub.outputConnection);
  }

  b.initSvg?.(); b.render?.();
  return b;
}

// sun trigger
function makeSunTriggerBlock(workspace, t) {
  if (!canCreate('ha_event_sun')) {
    return safeRaw(workspace, 'event', [
      `- trigger: sun`,
      ...(t.event ? [`  event: ${t.event}`] : []),
      ...(t.offset != null ? [`  offset: ${JSON.stringify(t.offset)}`] : []),
    ]);
  }

  const b = workspace.newBlock('ha_event_sun');

  if (b.getField('EVENT') && (t.event === 'sunrise' || t.event === 'sunset')) {
    b.setFieldValue(t.event, 'EVENT');
  }

  let off = t.offset;
  if (off && typeof off === 'string') off = parseOffsetHMS(off);

  if (off && canCreate('ha_event_offset') && b.getInput && b.getInput('OFFSET')) {
    const sub = workspace.newBlock('ha_event_offset');
    set(sub, 'SIGN', off.sign === '-' ? '-' : '+');
    set(sub, 'H', String(off.hours ?? 0).padStart(2, '0'));
    set(sub, 'M', String(off.minutes ?? 0).padStart(2, '0'));
    set(sub, 'S', String(off.seconds ?? 0).padStart(2, '0'));
    sub.initSvg(); sub.render();
    b.getInput('OFFSET').connection.connect(sub.outputConnection);
  } else if (t.offset != null && !off) {
    // offset 파싱이 안 되면 RAW로
    disposeIfPossible(b);
    return safeRaw(workspace, 'event', [
      `- trigger: sun`,
      ...(t.event ? [`  event: ${t.event}`] : []),
      `  offset: ${JSON.stringify(t.offset)}`,
    ]);
  }

  b.initSvg?.(); b.render?.();
  return b;
}

// homeassistant trigger
function makeHAEventTriggerBlock(workspace, t) {
  if (!canCreate('ha_event_homeassistant')) {
    return safeRaw(workspace, 'event', [
      `- trigger: homeassistant`,
      ...(t.event ? [`  event: ${t.event}`] : []),
    ]);
  }
  const b = workspace.newBlock('ha_event_homeassistant');
  set(b, 'EVENT', t.event || '');
  b.initSvg?.(); b.render?.();
  return b;
}

// sun.sun 전용 state 트리거 → ha_event_sun_state
function makeSunStateTriggerBlock(workspace, t) {
  const fromVal =
    t.from === undefined || t.from === null || t.from === ''
      ? ''
      : String(t.from);

  const toVal =
    t.to === undefined || t.to === null || t.to === ''
      ? ''
      : String(t.to);
  const forStr = toHMSString(t.for);

  if (!canCreate('ha_event_sun_state')) {
    return safeRaw(workspace, 'event', [
      `- trigger: state`,
      `  entity_id: sun.sun`,
      ...(fromVal ? [`  from: '${fromVal}'`] : []),
      ...(toVal ? [`  to: '${toVal}'`] : []),
      ...(forStr ? [`  for: "${forStr}"`] : []),
    ]);
  }

  const b = workspace.newBlock('ha_event_sun_state');

  if (!setAndVerifyDropdown(b, 'FROM', fromVal) || !setAndVerifyDropdown(b, 'TO', toVal)) {
    disposeIfPossible(b);
    return safeRaw(workspace, 'event', [
      `- trigger: state`,
      `  entity_id: sun.sun`,
      ...(fromVal ? [`  from: '${fromVal}'`] : []),
      ...(toVal ? [`  to: '${toVal}'`] : []),
      ...(forStr ? [`  for: "${forStr}"`] : []),
    ]);
  }

  if (t.for && canCreate('ha_event_for_hms') && b.getInput && b.getInput('FOR')) {
    const sub = workspace.newBlock('ha_event_for_hms');
    set(sub, 'H', t.for.hours ?? 0);
    set(sub, 'M', t.for.minutes ?? 0);
    set(sub, 'S', t.for.seconds ?? 0);
    sub.initSvg(); sub.render();
    b.getInput('FOR').connection.connect(sub.outputConnection);
  }

  b.initSvg?.();
  b.render?.();
  return b;
}

// time trigger
function makeTimeTriggerBlock(workspace, t) {
  const atRaw = Array.isArray(t.at) ? t.at[0] : t.at;
  const parsed = parseAtTime(String(atRaw ?? ''));

  if (!canCreate('ha_event_time_state') || !parsed) {
    return safeRaw(workspace, 'event', [
      `- trigger: time`,
      ...(atRaw != null ? [`  at: ${JSON.stringify(atRaw)}`] : []),
    ]);
  }

  const b = workspace.newBlock('ha_event_time_state');

  // 24h -> 12h
  let hour12 = parsed.hh % 12;
  if (hour12 === 0) hour12 = 12;
  const period = parsed.hh >= 12 ? 'PM' : 'AM';

  set(b, 'HOUR', hour12);
  set(b, 'MIN', parsed.mm);
  setAndVerifyDropdown(b, 'PERIOD', period);

  b.initSvg?.(); b.render?.();
  return b;
}

function makeTimePatternTriggerBlock(workspace, t) {
  const TYPE = 'ha_event_time_pattern';
  const toScalarText = (v) => {
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    return null;
  };

  const hours = toScalarText(t.hours);
  const minutes = toScalarText(t.minutes);
  const seconds = toScalarText(t.seconds);
  if (hours === null || minutes === null || seconds === null) {
    return safeRaw(workspace, 'event', triggerToRawLines(t));
  }
  if (!hours && !minutes && !seconds) {
    return safeRaw(workspace, 'event', triggerToRawLines(t));
  }

  if (!canCreate(TYPE)) {
    return safeRaw(workspace, 'event', triggerToRawLines(t));
  }

  const b = workspace.newBlock(TYPE);
  if (hours) set(b, 'HOURS', hours);
  if (minutes) set(b, 'MINUTES', minutes);
  if (seconds) set(b, 'SECONDS', seconds);
  b.initSvg?.();
  b.render?.();
  return b;
}

function makeMqttTriggerBlock(workspace, t) {
  const topic = t?.topic;
  if (!isScalar(topic) || String(topic).trim() === '') {
    return safeRaw(workspace, 'event', triggerToRawLines(t));
  }

  const allowed = new Set([
    'platform', 'trigger', 'type', 'topic', 'payload', 'value_template', 'encoding', 'id',
  ]);
  for (const k of Object.keys(t || {})) {
    if (!allowed.has(k)) {
      return safeRaw(workspace, 'event', triggerToRawLines(t));
    }
  }

  if (!canCreate('ha_event_mqtt')) {
    return safeRaw(workspace, 'event', triggerToRawLines(t));
  }

  const b = workspace.newBlock('ha_event_mqtt');
  set(b, 'TOPIC', String(topic));

  const options = [];
  if (Object.prototype.hasOwnProperty.call(t, 'payload')) {
    if (!isScalar(t.payload)) {
      disposeIfPossible(b);
      return safeRaw(workspace, 'event', triggerToRawLines(t));
    }
    options.push(['ha_event_mqtt_payload', String(t.payload ?? '')]);
  }
  if (Object.prototype.hasOwnProperty.call(t, 'value_template')) {
    if (!isScalar(t.value_template)) {
      disposeIfPossible(b);
      return safeRaw(workspace, 'event', triggerToRawLines(t));
    }
    options.push(['ha_event_mqtt_value_template', String(t.value_template ?? '')]);
  }
  if (Object.prototype.hasOwnProperty.call(t, 'encoding')) {
    if (!isScalar(t.encoding)) {
      disposeIfPossible(b);
      return safeRaw(workspace, 'event', triggerToRawLines(t));
    }
    options.push(['ha_event_mqtt_encoding', String(t.encoding ?? '')]);
  }

  if (options.length) {
    if (b.getField('USE_OPTIONS')) set(b, 'USE_OPTIONS', 'TRUE');
    if (!b.getInput('OPTIONS') && typeof b.loadExtraState === 'function') {
      try {
        const current = b.saveExtraState?.() || {};
        b.loadExtraState({ ...current, hasOptions: true });
      } catch (_) {
        // ignore
      }
    }

    if (!b.getInput('OPTIONS')) {
      disposeIfPossible(b);
      return safeRaw(workspace, 'event', triggerToRawLines(t));
    }

    for (const [type, value] of options) {
      if (!canCreate(type)) {
        disposeIfPossible(b);
        return safeRaw(workspace, 'event', triggerToRawLines(t));
      }
      const child = workspace.newBlock(type);
      if (type === 'ha_event_mqtt_payload' || type === 'ha_event_mqtt_value_template') {
        set(child, 'VALUE', value);
      } else if (type === 'ha_event_mqtt_encoding') {
        const enc = String(value);
        if (enc === '') {
          set(child, 'MODE', 'binary');
        } else if (enc === 'utf-8') {
          set(child, 'MODE', 'utf-8');
        } else {
          set(child, 'MODE', 'custom');
          set(child, 'CUSTOM', enc);
        }
      }
      child.initSvg?.();
      child.render?.();
      appendChainToInput(b, child, 'OPTIONS');
    }
  }

  b.initSvg?.();
  b.render?.();
  return b;
}

function parseDurationValue(v) {
  if (isPlainObject(v)) {
    return {
      hours: Number(v.hours ?? 0) || 0,
      minutes: Number(v.minutes ?? 0) || 0,
      seconds: Number(v.seconds ?? 0) || 0,
    };
  }
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,3}):(\d{2}):(\d{2})$/);
    if (!m) return null;
    return { hours: Number(m[1]), minutes: Number(m[2]), seconds: Number(m[3]) };
  }
  return null;
}

function stripTemplateExpressionBraces(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  const expr = s.match(/^\{\{\s*([\s\S]*?)\s*\}\}$/);
  if (expr) s = expr[1].trim();
  return s;
}

function makeTemplateTriggerBlock(workspace, t) {
  if (!canCreate('ha_event_template')) {
    return safeRaw(workspace, 'event', triggerToRawLines(t));
  }

  if (!isScalar(t.value_template) || String(t.value_template).trim() === '') {
    return safeRaw(workspace, 'event', triggerToRawLines(t));
  }

  const allowed = new Set(['platform', 'trigger', 'type', 'value_template', 'for', 'id', 'enabled', 'variables']);
  for (const k of Object.keys(t || {})) {
    if (!allowed.has(k)) return safeRaw(workspace, 'event', triggerToRawLines(t));
  }
  if ((t.enabled != null && !isScalar(t.enabled)) || (t.variables != null && !isPlainObject(t.variables))) {
    return safeRaw(workspace, 'event', triggerToRawLines(t));
  }

  const b = workspace.newBlock('ha_event_template');
  set(b, 'TEMPLATE', stripTemplateExpressionBraces(t.value_template));

  const dur = parseDurationValue(t.for);
  if (dur && canCreate('ha_event_for_hms') && b.getInput?.('FOR')) {
    const sub = workspace.newBlock('ha_event_for_hms');
    set(sub, 'H', dur.hours);
    set(sub, 'M', dur.minutes);
    set(sub, 'S', dur.seconds);
    sub.initSvg?.();
    sub.render?.();
    b.getInput('FOR').connection.connect(sub.outputConnection);
  } else if (t.for != null) {
    disposeIfPossible(b);
    return safeRaw(workspace, 'event', triggerToRawLines(t));
  }

  b.initSvg?.();
  b.render?.();
  return b;
}

function ensureEventInput(block, inputName, stateKey, checkType, label) {
  if (!block) return false;
  if (block.getInput(inputName)) return true;

  if (typeof block.loadExtraState === 'function') {
    try {
      const current = block.saveExtraState?.() || {};
      block.loadExtraState({ ...current, [stateKey]: true });
      if (block.getInput(inputName)) return true;
    } catch (_) {
      // fall through
    }
  }

  const legacyKey = stateKey.endsWith('_') ? stateKey : `${stateKey}_`;
  if (stateKey in block || legacyKey in block) {
    if (stateKey in block) block[stateKey] = true;
    if (legacyKey in block) block[legacyKey] = true;
    if (typeof block.updateShape_ === 'function') block.updateShape_();
    if (block.getInput(inputName)) return true;
  }

  // hard fallback: shape API가 실패해도 입력을 강제로 만든다.
  try {
    const input = block.appendStatementInput(inputName);
    if (checkType) input.setCheck(checkType);
    if (label) input.appendField(label);
    return true;
  } catch (_) {
    // ignore
  }
  return false;
}

function makeCallServiceEventDataBlock(workspace, eventData) {
  if (!canCreate('ha_event_event_data_call_service')) return null;
  if (!isPlainObject(eventData)) return null;

  const serviceData = eventData.service_data;
  if (serviceData != null && !isPlainObject(serviceData)) return null;

  const b = workspace.newBlock('ha_event_event_data_call_service');
  const serviceKvType = canCreate('ha_event_kv')
    ? 'ha_event_kv'
    : (canCreate('ha_event_service_data_kv') ? 'ha_event_service_data_kv' : null);
  const domainValue = eventData.domain == null ? '' : String(eventData.domain);
  const serviceValue = eventData.service == null ? '' : String(eventData.service);

  if (b.getField('DOMAIN_MODE')) set(b, 'DOMAIN_MODE', 'DROPDOWN');
  if (!setAndVerifyDropdown(b, 'DOMAIN', domainValue)) {
    if (b.getField('DOMAIN_MODE')) set(b, 'DOMAIN_MODE', 'TEXT');
    if (b.getField('DOMAIN_TEXT')) set(b, 'DOMAIN_TEXT', domainValue);
  }

  if (b.getField('SERVICE_MODE')) set(b, 'SERVICE_MODE', 'DROPDOWN');
  if (!setAndVerifyDropdown(b, 'SERVICE', serviceValue)) {
    if (b.getField('SERVICE_MODE')) set(b, 'SERVICE_MODE', 'TEXT');
    if (b.getField('SERVICE_TEXT')) set(b, 'SERVICE_TEXT', serviceValue);
  }

  if (eventData.service_call_id != null) {
    set(b, 'SERVICE_CALL_ID', String(eventData.service_call_id));
  }

  if (isPlainObject(serviceData) && Object.keys(serviceData).length) {
    for (const [k, v] of Object.entries(serviceData)) {
      if (k === 'entity_id') {
        if (!isScalar(v) || !canCreate('ha_event_service_data_entity_id')) {
          disposeIfPossible(b);
          return null;
        }
        const child = workspace.newBlock('ha_event_service_data_entity_id');
        const entityValue = v == null ? '' : String(v);
        if (child.getField('ENTITY_MODE')) set(child, 'ENTITY_MODE', 'DROPDOWN');
        if (!setAndVerifyDropdown(child, 'ENTITY_ID', entityValue)) {
          if (child.getField('ENTITY_MODE')) set(child, 'ENTITY_MODE', 'TEXT');
          set(child, 'VALUE', entityValue);
        }
        child.initSvg?.();
        child.render?.();
        appendChainToInput(b, child, 'SERVICE_DATA');
        continue;
      }

      if (!isScalar(v) || !serviceKvType) {
        disposeIfPossible(b);
        return null;
      }
      const child = workspace.newBlock(serviceKvType);
      set(child, 'KEY', k);
      set(child, 'VALUE', v == null ? '' : String(v));
      child.initSvg?.();
      child.render?.();
      appendChainToInput(b, child, 'SERVICE_DATA');
    }
  }

  b.initSvg?.();
  b.render?.();
  return b;
}

function makeEventTriggerBlock(workspace, t) {
  if (!canCreate('ha_event_event')) {
    return safeRaw(workspace, 'event', triggerToRawLines(t));
  }

  const eventType = String(t.event_type || '').trim();
  if (!eventType) {
    return safeRaw(workspace, 'event', triggerToRawLines(t));
  }

  const eventData = t.event_data;
  const context = t.context;
  const isFlatObject = (obj) => isPlainObject(obj) && Object.values(obj).every(isScalar);
  const isCallService = eventType === 'call_service';
  const eventKvType = canCreate('ha_event_kv')
    ? 'ha_event_kv'
    : (canCreate('ha_event_event_data_kv') ? 'ha_event_event_data_kv' : null);

  if (eventData != null) {
    const allowCallService = isCallService && isPlainObject(eventData);
    if (!isFlatObject(eventData) && !allowCallService) {
      return safeRaw(workspace, 'event', triggerToRawLines(t));
    }
  }
  if (context != null && !isFlatObject(context)) {
    return safeRaw(workspace, 'event', triggerToRawLines(t));
  }

  const b = workspace.newBlock('ha_event_event');
  set(b, 'EVENT_TYPE', eventType);
  b.initSvg?.();
  b.render?.();

  if (isPlainObject(eventData) && Object.keys(eventData).length) {
    if (!ensureEventInput(b, 'EVENT_DATA', 'hasEventData', 'HA_EVENT_DATA', 'data')) {
      disposeIfPossible(b);
      return safeRaw(workspace, 'event', triggerToRawLines(t));
    }

    if (isCallService) {
      const callServiceBlock = makeCallServiceEventDataBlock(workspace, eventData);
      if (!callServiceBlock) {
        disposeIfPossible(b);
        return safeRaw(workspace, 'event', triggerToRawLines(t));
      }
      appendChainToInput(b, callServiceBlock, 'EVENT_DATA');

      for (const [k, v] of Object.entries(eventData)) {
        if (k === 'domain' || k === 'service' || k === 'service_data' || k === 'service_call_id') continue;
        if (!isScalar(v) || !eventKvType) {
          disposeIfPossible(b);
          return safeRaw(workspace, 'event', triggerToRawLines(t));
        }
        const kv = workspace.newBlock(eventKvType);
        set(kv, 'KEY', k);
        set(kv, 'VALUE', v == null ? '' : String(v));
        kv.initSvg?.();
        kv.render?.();
        appendChainToInput(b, kv, 'EVENT_DATA');
      }
    } else {
      for (const [k, v] of Object.entries(eventData)) {
        if (!eventKvType) {
          disposeIfPossible(b);
          return safeRaw(workspace, 'event', triggerToRawLines(t));
        }
        const kv = workspace.newBlock(eventKvType);
        set(kv, 'KEY', k);
        set(kv, 'VALUE', v == null ? '' : String(v));
        kv.initSvg?.();
        kv.render?.();
        appendChainToInput(b, kv, 'EVENT_DATA');
      }
    }
  }

  if (isPlainObject(context) && Object.keys(context).length) {
    if (!ensureEventInput(b, 'CONTEXT_DATA', 'hasContext', 'HA_EVENT_CONTEXT', 'context')) {
      disposeIfPossible(b);
      return safeRaw(workspace, 'event', triggerToRawLines(t));
    }
    for (const [k, v] of Object.entries(context)) {
      if (!canCreate('ha_event_context_kv')) {
        disposeIfPossible(b);
        return safeRaw(workspace, 'event', triggerToRawLines(t));
      }
      const kv = workspace.newBlock('ha_event_context_kv');
      if (!setAndVerifyDropdown(kv, 'CONTEXT_KEY', k)) {
        disposeIfPossible(kv);
        disposeIfPossible(b);
        return safeRaw(workspace, 'event', triggerToRawLines(t));
      }
      set(kv, 'VALUE', v == null ? '' : String(v));
      kv.initSvg?.();
      kv.render?.();
      appendChainToInput(b, kv, 'CONTEXT_DATA');
    }
  }

  return b;
}

function appendChainToInput(parent, child, inputName) {
  const input = parent?.getInput?.(inputName);
  if (!input?.connection || !child?.previousConnection) return;
  const head = input.connection.targetBlock();
  if (!head) {
    input.connection.connect(child.previousConnection);
    return;
  }
  let tail = head;
  while (tail.nextConnection?.targetBlock()) {
    tail = tail.nextConnection.targetBlock();
  }
  tail.nextConnection?.connect(child.previousConnection);
}

/* ========== 엔트리 포인트 ========== */

export function createTriggerBlock(t, workspace) {
  const platform = t.platform || t.trigger || t.type || (t.entity_id ? 'state' : null);

  // ① sun
  if (platform === 'sun') {
    const b = makeSunTriggerBlock(workspace, t);
    setIdIfPresent(b, t);
    return b;
  }

  // ② Home Assistant 라이프사이클 이벤트만 구조 블록으로 매핑
  if (platform === 'homeassistant') {
    const b = makeHAEventTriggerBlock(workspace, t);
    setIdIfPresent(b, t);
    return b;
  }

  // ②-1 일반 event trigger는 현재 전용 블록이 없으므로 raw 보존
  if (platform === 'event') {
    const b = makeEventTriggerBlock(workspace, t);
    setIdIfPresent(b, t);
    return b;
  }

  // ③ time
  if (platform === 'time') {
    const b = makeTimeTriggerBlock(workspace, t);
    setIdIfPresent(b, t);
    return b;
  }

  // ③-1 time_pattern
  if (platform === 'time_pattern') {
    const b = makeTimePatternTriggerBlock(workspace, t);
    setIdIfPresent(b, t);
    return b;
  }

  // ③-2 mqtt
  if (platform === 'mqtt') {
    const b = makeMqttTriggerBlock(workspace, t);
    setIdIfPresent(b, t);
    return b;
  }

  // ③-3 template
  if (platform === 'template') {
    const b = makeTemplateTriggerBlock(workspace, t);
    setIdIfPresent(b, t);
    return b;
  }

  // ④ numeric_state — entity_id 배열이면 분해
  if (platform === 'numeric_state') {
    const entities = toArray(t.entity_id ?? t.entity ?? []);
    if (entities.length > 1) {
      const head = makeNumericStateTriggerBlock(workspace, t, entities[0]);
      if (head) setIdIfPresent(head, t);
      let tail = head;
      for (let i = 1; i < entities.length; i++) {
        const nb = makeNumericStateTriggerBlock(workspace, t, entities[i]);
        if (nb) setIdIfPresent(nb, t);
        if (tail && nb) connectNextChain(tail, nb), (tail = nb);
      }
      return head;
    }
    const single = makeNumericStateTriggerBlock(workspace, t, entities[0] ?? '');
    setIdIfPresent(single, t);
    return single;
  }

  // ⑤ state — entity_id 기반 트리거
  if (platform === 'state') {
    const entities = toArray(t.entity_id ?? t.entity ?? []);

    // ④-1. sun.sun 전용: ha_event_sun_state 로 매핑
    if (entities.length === 1 && entities[0] === 'sun.sun') {
      const b = makeSunStateTriggerBlock(workspace, t);
      setIdIfPresent(b, t);
      return b;
    }

    // ④-2. 일반 state 트리거 (event_${domain}_state)
    if (entities.length > 1) {
      const head = makeStateTriggerBlock(workspace, t, entities[0]);
      if (head) setIdIfPresent(head, t);
      let tail = head;
      for (let i = 1; i < entities.length; i++) {
        const nb = makeStateTriggerBlock(workspace, t, entities[i]);
        if (nb) setIdIfPresent(nb, t);
        if (tail && nb) connectNextChain(tail, nb), (tail = nb);
      }
      return head;
    }

    const single = makeStateTriggerBlock(workspace, t, entities[0] ?? '');
    setIdIfPresent(single, t);
    return single;
  }

  console.warn('[import] unsupported trigger platform:', platform, t);
  return safeRaw(workspace, 'event', triggerToRawLines(t));
}

function normalizeTriggerPlatform(t) {
  return t?.platform || t?.trigger || t?.type || (t?.entity_id ? 'state' : null);
}

function normalizeStateTriggerShape(t) {
  const entityRaw = t?.entity_id ?? t?.entity;
  const entities = toArray(entityRaw).filter((x) => typeof x === 'string' && x.includes('.'));
  if (!entities.length) return null;

  const platform = normalizeTriggerPlatform(t);
  if (platform !== 'state') return null;

  const domain = entities[0].split('.', 1)[0];
  if (!domain || domain === 'sun') return null;
  if (!entities.every((eid) => eid.split('.', 1)[0] === domain)) return null;

  const fromVal = (t.from == null || t.from === '') ? '' : String(t.from);
  const toVal = (t.to == null || t.to === '') ? '' : String(t.to);
  const forStr = toHMSString(t.for) || '';
  const hasId = t?.id != null && String(t.id).trim() !== '';
  const idValue = hasId ? String(t.id) : '';

  const allowed = new Set(['platform', 'trigger', 'type', 'entity_id', 'entity', 'from', 'to', 'for', 'id']);
  for (const k of Object.keys(t || {})) {
    if (!allowed.has(k)) return null;
  }

  return { domain, entityIds: entities, fromVal, toVal, forStr, hasId, idValue };
}

function makeStateGroupTriggerBlock(workspace, group) {
  if (!canCreate('event_group_entities')) {
    return null;
  }

  const b = workspace.newBlock('event_group_entities');
  const domain = group.domain || 'cover';
  setAndVerifyDropdown(b, 'DOMAIN', domain, { allowUnknown: true });
  setAndVerifyDropdown(b, 'FROM', group.fromVal || '', { allowUnknown: true });
  setAndVerifyDropdown(b, 'TO', group.toVal || '', { allowUnknown: true });

  if (group.forStr && canCreate('ha_event_for_hms') && b.getInput?.('FOR')) {
    const m = String(group.forStr).match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (m) {
      const sub = workspace.newBlock('ha_event_for_hms');
      set(sub, 'H', m[1]);
      set(sub, 'M', m[2]);
      set(sub, 'S', m[3]);
      sub.initSvg?.();
      sub.render?.();
      b.getInput('FOR').connection.connect(sub.outputConnection);
    }
  }

  const createStateGroupItemBlock = (eid) => {
    const domain = String(group.domain || '').trim();
    const preferredType = domain ? `event_${domain}_state` : '';
    if (preferredType && canCreate(preferredType)) {
      const child = workspace.newBlock(preferredType);
      const ok = setAndVerifyDropdown(child, 'ENTITY_ID', eid, { allowUnknown: true });
      if (!ok) {
        disposeIfPossible(child);
      } else {
        // Group parent owns from/to/for. Keep child fields neutral to avoid confusion.
        if (child.getField('FROM')) setAndVerifyDropdown(child, 'FROM', '', { allowUnknown: true });
        if (child.getField('TO')) setAndVerifyDropdown(child, 'TO', '', { allowUnknown: true });
        child.initSvg?.();
        child.render?.();
        return child;
      }
    }

    if (canCreate('event_group_entity_item')) {
      const child = workspace.newBlock('event_group_entity_item');
      const ok = setAndVerifyDropdown(child, 'ENTITY_ID', eid, { allowUnknown: true });
      if (!ok) {
        disposeIfPossible(child);
        return null;
      }
      child.initSvg?.();
      child.render?.();
      return child;
    }

    return null;
  };

  let tail = null;
  for (const eid of group.entityIds) {
    const item = createStateGroupItemBlock(eid);
    if (!item) continue;

    if (!tail) {
      const input = b.getInput('ENTITIES');
      input?.connection?.connect(item.previousConnection);
    } else {
      tail.nextConnection?.connect(item.previousConnection);
    }
    tail = item;
  }

  b.initSvg?.();
  b.render?.();
  return b;
}

function normalizeNumericStateTriggerShape(t) {
  const platform = normalizeTriggerPlatform(t);
  if (platform !== 'numeric_state') return null;

  const entityRaw = t?.entity_id ?? t?.entity;
  const entities = toArray(entityRaw).filter((x) => typeof x === 'string' && x.includes('.'));
  if (!entities.length) return null;
  if (!entities.every((eid) => eid.startsWith('sensor.'))) return null;

  const hasAbove = t?.above != null && t?.above !== '';
  const hasBelow = t?.below != null && t?.below !== '';
  if (!hasAbove && !hasBelow) return null;

  const aboveVal = hasAbove ? Number(t.above) : null;
  const belowVal = hasBelow ? Number(t.below) : null;
  if (hasAbove && Number.isNaN(aboveVal)) return null;
  if (hasBelow && Number.isNaN(belowVal)) return null;

  const forStr = toHMSString(t.for) || '';
  const hasId = t?.id != null && String(t.id).trim() !== '';
  const idValue = hasId ? String(t.id) : '';
  const allowed = new Set(['platform', 'trigger', 'type', 'entity_id', 'entity', 'above', 'below', 'for', 'id']);
  for (const k of Object.keys(t || {})) {
    if (!allowed.has(k)) return null;
  }

  return { entityIds: entities, hasAbove, hasBelow, aboveVal, belowVal, forStr, hasId, idValue };
}

function makeNumericStateGroupTriggerBlock(workspace, group) {
  if (!canCreate('event_group_numeric_entities')) {
    return null;
  }

  const b = workspace.newBlock('event_group_numeric_entities');
  set(b, 'USE_ABOVE', group.hasAbove ? 'TRUE' : 'FALSE');
  set(b, 'USE_BELOW', group.hasBelow ? 'TRUE' : 'FALSE');
  if (group.hasAbove) set(b, 'ABOVE', group.aboveVal);
  if (group.hasBelow) set(b, 'BELOW', group.belowVal);

  if (group.forStr && canCreate('ha_event_for_hms') && b.getInput?.('FOR')) {
    const m = String(group.forStr).match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (m) {
      const sub = workspace.newBlock('ha_event_for_hms');
      set(sub, 'H', m[1]);
      set(sub, 'M', m[2]);
      set(sub, 'S', m[3]);
      sub.initSvg?.();
      sub.render?.();
      b.getInput('FOR').connection.connect(sub.outputConnection);
    }
  }

  const createNumericGroupItemBlock = (eid) => {
    if (canCreate('event_sensor_numeric_state')) {
      const child = workspace.newBlock('event_sensor_numeric_state');
      const ok = setAndVerifyDropdown(child, 'ENTITY_ID', eid, { allowUnknown: true });
      if (!ok) {
        disposeIfPossible(child);
      } else {
        // Group parent owns threshold/for. Keep child values neutral.
        if (child.getField('ABOVE')) set(child, 'ABOVE', 0);
        if (child.getField('BELOW')) set(child, 'BELOW', 0);
        child.initSvg?.();
        child.render?.();
        return child;
      }
    }

    if (canCreate('event_group_entity_item')) {
      const child = workspace.newBlock('event_group_entity_item');
      const ok = setAndVerifyDropdown(child, 'ENTITY_ID', eid, { allowUnknown: true });
      if (!ok) {
        disposeIfPossible(child);
        return null;
      }
      child.initSvg?.();
      child.render?.();
      return child;
    }

    return null;
  };

  let tail = null;
  for (const eid of group.entityIds) {
    const item = createNumericGroupItemBlock(eid);
    if (!item) continue;
    if (!tail) {
      const input = b.getInput('ENTITIES');
      input?.connection?.connect(item.previousConnection);
    } else {
      tail.nextConnection?.connect(item.previousConnection);
    }
    tail = item;
  }

  b.initSvg?.();
  b.render?.();
  return b;
}

export function createTriggerBlocks(triggers, workspace) {
  const rows = Array.isArray(triggers) ? triggers : [];
  if (!rows.length) return [];

  const out = [];
  for (const row of rows) {
    const stateShape = normalizeStateTriggerShape(row);
    if (stateShape && stateShape.entityIds.length > 1) {
      const group = {
        domain: stateShape.domain,
        fromVal: stateShape.fromVal,
        toVal: stateShape.toVal,
        forStr: stateShape.forStr,
        // row 내부 entity_id 배열의 순서/개수를 그대로 유지한다.
        entityIds: [...stateShape.entityIds],
        id: stateShape.idValue,
      };
      const gb = makeStateGroupTriggerBlock(workspace, group);
      if (gb) {
        setIdIfPresent(gb, { id: group.id });
        out.push(gb);
        continue;
      }
    }

    const numericShape = normalizeNumericStateTriggerShape(row);
    if (numericShape && numericShape.entityIds.length > 1) {
      const group = {
        entityIds: [...numericShape.entityIds],
        hasAbove: numericShape.hasAbove,
        hasBelow: numericShape.hasBelow,
        aboveVal: numericShape.aboveVal,
        belowVal: numericShape.belowVal,
        forStr: numericShape.forStr,
        id: numericShape.idValue,
      };
      const gb = makeNumericStateGroupTriggerBlock(workspace, group);
      if (gb) {
        setIdIfPresent(gb, { id: group.id });
        out.push(gb);
        continue;
      }
    }

    const b = createTriggerBlock(row, workspace);
    if (b) out.push(b);
  }

  return out;
}
