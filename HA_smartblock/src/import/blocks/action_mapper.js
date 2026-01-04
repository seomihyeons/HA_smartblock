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

// message 문자열에서 {{ ... }} 템플릿을 찾아
// text 블록 + template 블록으로 쪼개서 action_message 아래에 붙여줌
const TEMPLATE_MAP = {
  'trigger.entity_id': 'TRIGGER_ENTITY_ID',
  'trigger.to_state.attributes.friendly_name': 'TRIGGER_FRIENDLY_NAME',
  'trigger.to_state.state': 'TRIGGER_NEW_STATE',
  'trigger.from_state.state': 'TRIGGER_OLD_STATE',
  'now()': 'NOW',
  'now().date()': 'DATE',
  "now().strftime('%H:%M')": 'TIME_HM',
  "now().strftime('%A')": 'WEEKDAY',
  'user.name': 'USER_NAME',
  'user.language': 'USER_LANG',
  'user.id': 'USER_ID',
};

function normalizeTemplate(expr) {
  // "{{ ... }}" 앞뒤 {{ }}와 공백 제거
  return expr.replace(/^\s*\{\{\s*|\s*\}\}\s*$/g, '').trim();
}

function buildNotifyMessageBlocks(message, msgBlock, workspace) {
  if (typeof message !== 'string' || !message.length) return;

  // {{ ... }} 단위로 split
  const re = /(\{\{[^}]*\}\})/g;
  let lastIndex = 0;
  let m;

  while ((m = re.exec(message)) !== null) {
    const before = message.slice(lastIndex, m.index);
    if (before) {
      const textBlk = workspace.newBlock('action_notify_message_text');
      textBlk.setFieldValue(before, 'TEXT');
      textBlk.initSvg();
      textBlk.render();
      appendStmt(msgBlock, textBlk, 'MESSAGE_BLOCKS');
    }

    const raw = m[1]; // "{{ ... }}"
    const key = normalizeTemplate(raw);
    const kind = TEMPLATE_MAP[key];

    if (kind && canCreate('action_notify_message_template')) {
      const tplBlk = workspace.newBlock('action_notify_message_template');
      tplBlk.setFieldValue(kind, 'TEMPLATE_KIND');
      tplBlk.initSvg();
      tplBlk.render();
      appendStmt(msgBlock, tplBlk, 'MESSAGE_BLOCKS');
    } else {
      // 모르는 템플릿은 일단 그대로 텍스트로 (나중에 raw-template 블록로 교체 가능)
      const textBlk = workspace.newBlock('action_notify_message_text');
      textBlk.setFieldValue(raw, 'TEXT');
      textBlk.initSvg();
      textBlk.render();
      appendStmt(msgBlock, textBlk, 'MESSAGE_BLOCKS');
    }

    lastIndex = re.lastIndex;
  }

  const rest = message.slice(lastIndex);
  if (rest) {
    const textBlk = workspace.newBlock('action_notify_message_text');
    textBlk.setFieldValue(rest, 'TEXT');
    textBlk.initSvg();
    textBlk.render();
    appendStmt(msgBlock, textBlk, 'MESSAGE_BLOCKS');
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

// cover/light + data.entity_id 리스트 → action_group_entities로 변환
function createGroupActionBlock(a, workspace, domain, method) {
  if (!canCreate('action_group_entities') || !canCreate('action_group_entity_item')) {
    console.warn('[import] group action blocks not available');
    return null;
  }

  const b = workspace.newBlock('action_group_entities');

  // DOMAIN, SERVICE 설정 (SERVICE 값은 'open_cover', 'turn_on' 같은 method 그대로)
  if (b.getField('DOMAIN')) b.setFieldValue(domain, 'DOMAIN');
  if (b.getField('SERVICE')) b.setFieldValue(method, 'SERVICE');

  // data.entity_id → 배열로 통일
  const entities = toArray(a.data?.entity_id ?? []);

  entities.forEach((eid) => {
    const child = workspace.newBlock('action_group_entity_item');
    if (child.getField('ENTITY_ID')) {
      child.setFieldValue(String(eid), 'ENTITY_ID');
    }
    child.initSvg(); child.render();
    appendStmt(b, child, 'ENTITIES');
  });

  b.initSvg(); b.render();
  return b;
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

    const svcFull = svc;                              // e.g., 'notify.telegram'
    const uiTarget = svcFull.replace(/^notify\./, '') || 'notify';

    const title = a?.data?.title ?? a?.data?.notification?.title ?? '';
    const message = a?.data?.message ?? a?.data?.notification?.message ?? '';

    const b = workspace.newBlock('action_notify');

    // 드롭다운 옵션에 값이 없으면 기본 'notify'로 폴백
    const field = b.getField('TARGET');
    const options = field?.getOptions ? field.getOptions().map(o => o[1]) : [];
    const valueToSet = options.includes(uiTarget) ? uiTarget : 'notify';
    b.setFieldValue(valueToSet, 'TARGET');

    b.initSvg();
    b.render();

    // 🔹 message → action_message + 하위 text/template 블록으로 변환
    if (message && canCreate('action_message')) {
      const msgBlock = workspace.newBlock('action_message');
      msgBlock.initSvg();
      msgBlock.render();

      // action_notify 의 MESSAGE_BLOCKS에 action_message 연결
      appendStmt(b, msgBlock, 'MESSAGE_BLOCKS');

      // action_message 안에 실제 text/template 조각들 생성
      buildNotifyMessageBlocks(String(message), msgBlock, workspace);
    }

    // title 은 아직 새 블록을 안 만드셨으니, 일단 무시하거나
    // 나중에 action_notify_title 같은 statement 블록 추가 후 여기서 연결

    return b;
  }

  /* ---------- 기타 도메인(라이트/스위치/락/미디어/클라이밋) ---------- */
  if (typeof svc !== 'string') return null;
  const [domain, method] = svc.split('.');
  
  // 1) cover/light + data.entity_id 리스트 → group 블록으로
  if ((domain === 'cover' || domain === 'light') && a.data && a.data.entity_id != null) {
    const groupBlock = createGroupActionBlock(a, workspace, domain, method);
    if (groupBlock) return groupBlock;
    // group 블록 생성 실패 시에는 아래 일반 경로로 폴백
  }
  
  // 2) 기존 single-entity 액션 경로 (target.entity_id / entity_id 사용)
  const map = {
    'light': 'action_light',
    'switch': 'action_switch',
    'lock': 'action_lock',
    'media_player': 'action_media_player',
    'climate': 'action_climate',
    // cover 는 지금은 group 블록만 사용 (단일 cover 액션 블록 만들면 여기에 추가)
  };
  const TYPE = map[domain];
  if (!TYPE || !canCreate(TYPE)) {
    console.warn('[import] no action block for domain:', domain, a);
    return null;
  }

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
