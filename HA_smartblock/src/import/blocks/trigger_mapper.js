// src/import/blocks/trigger_mapper.js
import * as Blockly from 'blockly';

const canCreate = (t) => !!Blockly.Blocks?.[t];
const set = (b, name, v) => { if (name && b.getField(name) && v != null) b.setFieldValue(String(v), name); };
const firstField = (b, list) => list.find(n => n && b.getField(n)) || null;

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
  if (!obj || obj.id == null) return;
  const f = firstField(block, ['ID','Id','id']);
  if (f) block.setFieldValue(String(obj.id), f);
}

// next 체인 연결
function connectNextChain(prevBlock, nextBlock) {
  if (!prevBlock || !nextBlock) return;
  const nextConn = prevBlock.nextConnection;
  const prevConn = nextBlock.previousConnection ?? nextBlock.outputConnection;
  if (nextConn && prevConn && !nextConn.targetConnection) nextConn.connect(prevConn);
}

/* ========== 개별 트리거 블록 생성기들 ========== */

// state 패밀리: 엔티티 1개 기준 블록 생성
function makeStateTriggerBlock(workspace, t, eid) {
  const domain = eid ? String(eid).split('.')[0] : null;
  const map = {
    light: 'ha_event_light_state',
    switch: 'ha_event_switch_state',
    lock: 'ha_event_lock_state',
    binary_sensor: 'ha_event_binary_state',
  };
  const TYPE = (domain && map[domain]) || null;
  if (!TYPE || !canCreate(TYPE)) {
    console.warn('[import] no trigger block for domain:', domain, t, 'entity:', eid);
    return null;
  }
  const b = workspace.newBlock(TYPE);
  const eidField = firstField(b, ['ENTITY','ENTITY_ID']);
  set(b, eidField, eid || t.entity || '');
  set(b, 'FROM', t.from);
  set(b, 'TO',   t.to);
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

// numeric_state: 엔티티 1개 기준 블록 생성
function makeNumericStateTriggerBlock(workspace, t, eid) {
  if (!canCreate('ha_event_numeric_state_sensor')) return null;
  const b = workspace.newBlock('ha_event_numeric_state_sensor');
  const eidField = firstField(b, ['ENTITY','ENTITY_ID']);
  set(b, eidField, eid || t.entity || '');
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

// 기타(해/이벤트 등) 단일 생성
function makeSunTriggerBlock(workspace, t) {
  if (!canCreate('ha_event_sun')) return null;
  const b = workspace.newBlock('ha_event_sun');
  if (b.getField('EVENT') && (t.event === 'sunrise' || t.event === 'sunset')) {
    b.setFieldValue(t.event, 'EVENT');
  }
  let off = t.offset;
  if (off && typeof off === 'string') off = parseOffsetHMS(off);
  if (off && canCreate('ha_event_offset') && b.getInput && b.getInput('OFFSET')) {
    const sub = workspace.newBlock('ha_event_offset');
    set(sub, 'SIGN', off.sign === '-' ? '-' : '+');
    set(sub, 'H', String(off.hours ?? 0).padStart(2,'0'));
    set(sub, 'M', String(off.minutes ?? 0).padStart(2,'0'));
    set(sub, 'S', String(off.seconds ?? 0).padStart(2,'0'));
    sub.initSvg(); sub.render();
    b.getInput('OFFSET').connection.connect(sub.outputConnection);
  }
  b.initSvg?.(); b.render?.();
  return b;
}

function makeHAEventTriggerBlock(workspace, t) {
  if (!canCreate('ha_event_homeassistant')) return null;
  const b = workspace.newBlock('ha_event_homeassistant');
  set(b, firstField(b, ['EVENT']), t.event || '');
  b.initSvg?.(); b.render?.();
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

  // ④ state — entity_id 배열이면 분해
  if (platform === 'state') {
    const entities = toArray(t.entity_id ?? t.entity ?? []);
    if (entities.length > 1) {
      // 엔티티별로 도메인이 다를 수 있으므로 각자 타입을 골라 만듭니다.
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
  return null;
}
