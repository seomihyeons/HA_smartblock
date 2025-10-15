// src/import/blocks/action_mapper.js
import * as Blockly from 'blockly';
import { createConditionsRoot } from './condition_mapper';

const canCreate = (t) => !!Blockly.Blocks?.[t];
const set = (b, name, v) => { if (name && b.getField(name)) b.setFieldValue(String(v), name); };
const firstField = (b, list) => list.find(n => n && b.getField(n)) || null;

// 단일/배열/없음 → 배열 통일
function toArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
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

// 🔗 next 체인 연결 유틸
function connectNextChain(prevBlock, nextBlock) {
  if (!prevBlock || !nextBlock) return;
  const nextConn = prevBlock.nextConnection;
  const prevConn = nextBlock.previousConnection ?? nextBlock.outputConnection;
  if (nextConn && prevConn && !nextConn.targetConnection) {
    nextConn.connect(prevConn);
  }
}

export function createActionNode(a, workspace) {
  /* ---------- choose/default → if-then/if-else ---------- */
  if (Array.isArray(a?.choose) && a.choose.length > 0) {
    const choice = a.choose[0];
    const hasDefault = !!a.default;
    const TYPE = hasDefault ? 'action_if_else' : 'action_if_then';
    if (!canCreate(TYPE)) return null;

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
    return b;
  }

  /* ---------- delay ---------- */
  if (a?.delay && canCreate('action_delay')) {
    const n = toHMS(a.delay);
    const b = workspace.newBlock('action_delay');
    set(b, 'H', n.hours); set(b, 'M', n.minutes); set(b, 'S', n.seconds);
    return b;
  }

  /* ---------- notify.* (UI엔 접두사 없이) ---------- */
  const svc = a?.action || a?.service;
  if (typeof svc === 'string' && svc.startsWith('notify.')) {
    if (!canCreate('action_notify')) return null;

    const svcFull = svc;                              // e.g., 'notify.alexa_media'
    const uiTarget = svcFull.replace(/^notify\./, '') || 'notify';

    const title = a?.data?.title ?? a?.data?.notification?.title ?? '';
    const message = a?.data?.message ?? a?.data?.notification?.message ?? '';

    const b = workspace.newBlock('action_notify');

    // 드롭다운 옵션에 값이 없으면 기본 'notify'로 폴백
    const field = b.getField('TARGET');
    const options = field?.getOptions ? field.getOptions().map(o => o[1]) : [];
    const valueToSet = options.includes(uiTarget) ? uiTarget : 'notify';
    b.setFieldValue(valueToSet, 'TARGET');

    if (message != null) b.setFieldValue(String(message), 'MESSAGE');

    // title 값이 있으면 서브 블록 생성 + 연결
    if (title && canCreate('action_notify_title') && b.getInput('TITLE')) {
      const t = workspace.newBlock('action_notify_title');
      t.setFieldValue(String(title), 'TITLE');
      t.initSvg();
      t.render();
      b.getInput('TITLE').connection.connect(t.outputConnection);
    }
    return b;
  }

  /* ---------- 기타 도메인(라이트/스위치/락/미디어/클라이밋) ---------- */
  if (typeof svc !== 'string') return null;
  const [domain, method] = svc.split('.');

  const map = {
    'light': 'action_light',
    'switch': 'action_switch',
    'lock': 'action_lock',
    'media_player': 'action_media_player',
    'climate': 'action_climate',
  };
  const TYPE = map[domain];
  if (!TYPE || !canCreate(TYPE)) {
    console.warn('[import] no action block for domain:', domain, a);
    return null;
  }

  // ✅ entity_id가 배열이면 엔티티별로 블록을 복제해 next 체인으로 연결
  const entityIds = toArray(a.target?.entity_id ?? a.entity_id);
  const dataObj = a.data ?? null;

  // 공통 생성기
  const makeOne = (eid) => {
    const blk = workspace.newBlock(TYPE);
    set(blk, firstField(blk, ['ACTION', 'SERVICE']), method);
    set(blk, firstField(blk, ['ENTITY', 'ENTITY_ID']), eid ?? '');
    if (dataObj) {
      const df = firstField(blk, ['DATA_JSON', 'DATA']);
      if (df) set(blk, df, JSON.stringify(dataObj, null, 2));
      else console.warn('[import] action data not mapped:', dataObj);
    }
    blk.initSvg?.();
    blk.render?.();
    return blk;
  };

  // 1) 엔티티 배열 → 체인(head 반환)
  if (entityIds.length > 1) {
    const head = makeOne(entityIds[0]);
    let tail = head;
    for (let i = 1; i < entityIds.length; i++) {
      const nb = makeOne(entityIds[i]);
      connectNextChain(tail, nb);
      tail = nb;
    }
    return head;
  }

  // 2) 단일/없음 → 단일 블록
  return makeOne(entityIds[0] ?? '');
}
