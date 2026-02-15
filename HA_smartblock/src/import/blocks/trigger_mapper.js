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

  if (!canCreate('ha_event_sun_state')) {
    return safeRaw(workspace, 'event', [
      `- trigger: state`,
      `  entity_id: sun.sun`,
      ...(fromVal ? [`  from: '${fromVal}'`] : []),
      ...(toVal ? [`  to: '${toVal}'`] : []),
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
    ]);
  }

  b.initSvg?.();
  b.render?.();
  return b;
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

  // ② Home Assistant 이벤트
  if (platform === 'homeassistant' || platform === 'event') {
    const b = makeHAEventTriggerBlock(workspace, t);
    setIdIfPresent(b, t);
    return b;
  }

  // ③ numeric_state — entity_id 배열이면 분해
  if (platform === 'numeric_state') {
    const entities = toArray(t.entity_id ?? t.entity ?? []);
    if (entities.length > 1) {
      const head = makeNumericStateTriggerBlock(workspace, t, entities[0]);
      let tail = head;
      for (let i = 1; i < entities.length; i++) {
        const nb = makeNumericStateTriggerBlock(workspace, t, entities[i]);
        if (tail && nb) connectNextChain(tail, nb), (tail = nb);
      }
      if (head) setIdIfPresent(head, t); // id는 head에만
      return head;
    }
    const single = makeNumericStateTriggerBlock(workspace, t, entities[0] ?? '');
    setIdIfPresent(single, t);
    return single;
  }

  // ④ state — entity_id 기반 트리거
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
      let tail = head;
      for (let i = 1; i < entities.length; i++) {
        const nb = makeStateTriggerBlock(workspace, t, entities[i]);
        if (tail && nb) connectNextChain(tail, nb), (tail = nb);
      }
      if (head) setIdIfPresent(head, t); // id는 head에만
      return head;
    }

    const single = makeStateTriggerBlock(workspace, t, entities[0] ?? '');
    setIdIfPresent(single, t);
    return single;
  }

  console.warn('[import] unsupported trigger platform:', platform, t);

  const fallback = [
    `- trigger: ${platform || 'unknown'}`,
    ...(t.entity_id ? [`  entity_id: ${Array.isArray(t.entity_id) ? JSON.stringify(t.entity_id) : t.entity_id}`] : []),
  ];
  return safeRaw(workspace, 'event', fallback);
}
