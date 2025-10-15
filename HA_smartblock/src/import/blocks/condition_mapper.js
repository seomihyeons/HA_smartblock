// src/import/blocks/condition_mapper.js
import * as Blockly from 'blockly';

const canCreate = (t) => !!Blockly.Blocks?.[t];
const set = (b, name, v) => { if (name && b.getField(name) && v != null) b.setFieldValue(String(v), name); };
const firstField = (b, list) => list.find(n => n && b.getField(n)) || null;
const toArray = (x) => (x == null ? [] : (Array.isArray(x) ? x : [x]));

// stmt 입력에 child 체인 붙이기
function appendStmt(parent, child, inputName) {
  if (!parent || !child) return;
  const input = parent.getInput(inputName);
  if (!input) return;
  const head = input.connection.targetBlock();
  const childConn = child.previousConnection ?? child.outputConnection;
  if (!head) { input.connection.connect(childConn); return; }
  let tail = head;
  while (tail.nextConnection && tail.nextConnection.targetBlock()) tail = tail.nextConnection.targetBlock();
  if (tail.nextConnection) tail.nextConnection.connect(childConn);
}

// next 체인 연결 (AND 의미)
function connectNextChain(prevBlock, nextBlock) {
  if (!prevBlock || !nextBlock) return;
  const nextConn = prevBlock.nextConnection;
  const prevConn = nextBlock.previousConnection ?? nextBlock.outputConnection;
  if (nextConn && prevConn && !nextConn.targetConnection) nextConn.connect(prevConn);
}

/* ========= helpers ========= */

function domainFromEntityId(eid) {
  if (typeof eid !== 'string') return null;
  const i = eid.indexOf('.');
  return i > 0 ? eid.slice(0, i) : null;
}

// 논리 그룹 감지: {or:[...]} / {and:[...]} / {not:[...]}  (구문 혼합도 수용)
function getLogicGroup(c) {
  if (!c || typeof c !== 'object') return null;
  for (const key of ['or', 'and', 'not']) {
    if (Array.isArray(c[key])) return { op: key, items: c[key] };
  }
  if (['or','and','not'].includes(c.condition) && (Array.isArray(c.conditions) || Array.isArray(c?.conditions?.items))) {
    const list = Array.isArray(c.conditions) ? c.conditions
               : Array.isArray(c?.conditions?.items) ? c.conditions.items : [];
    return { op: c.condition, items: list };
  }
  return null;
}

/* ========= state 조건 전용 생성기 (condition_state_<domain>) ========= */

function makeStateCondBlock(workspace, conditionObj, eid) {
  const domain = domainFromEntityId(eid);
  if (!domain) { console.warn('[import] invalid entity_id for state condition:', eid, conditionObj); return null; }

  const TYPE = `condition_state_${domain}`;
  if (!canCreate(TYPE)) {
    console.warn('[import] missing block type:', TYPE, 'for entity:', eid);
    return null;
  }

  const b = workspace.newBlock(TYPE);
  set(b, 'ENTITY_ID', eid ?? '');
  const stateVal = Array.isArray(conditionObj.state)
    ? (conditionObj.state[0] ?? '')
    : (conditionObj.state ?? conditionObj.to ?? '');
  set(b, 'STATE', stateVal ?? '');

  b.initSvg?.(); b.render?.();
  return b;
}

/* ========= numeric_state (entity) 생성기 ========= */

function makeNumericStateEntityBlock(workspace, conditionObj, eid) {
  const TYPE = 'condition_numeric_state_entity';
  if (!canCreate(TYPE)) { console.warn('[import] missing block type:', TYPE); return null; }

  const b = workspace.newBlock(TYPE);
  set(b, 'ENTITY_ID', eid ?? '');

  // ABOVE/BELOW는 숫자만 세팅 (없으면 0 유지)
  const above = conditionObj.above;
  const below = conditionObj.below;
  if (above != null && !Number.isNaN(Number(above))) set(b, 'ABOVE', Number(above));
  if (below != null && !Number.isNaN(Number(below))) set(b, 'BELOW', Number(below));

  b.initSvg?.(); b.render?.();
  return b;
}

/* ========= public: conditions 루트 만들기 ========= */

// 단일 조건/논리 노드 생성 (배열 entity_id 분해 포함, 논리 그룹 지원)
function createSingleConditionNode(c, workspace) {
  if (!c) return null;

  // 1) 논리 그룹 (or/and/not)
  const logic = getLogicGroup(c);
  if (logic) {
    if (!canCreate('condition_logic')) { console.warn('[import] missing block type: condition_logic'); return null; }
    const b = workspace.newBlock('condition_logic');
    const logicField = firstField(b, ['LOGIC','Logic','logic']);
    if (logicField) b.setFieldValue(logic.op.toUpperCase(), logicField);

    const kids = logic.items.map(item => createSingleConditionNode(item, workspace)).filter(Boolean);
    kids.forEach(child => appendStmt(b, child, 'SUBCONDITIONS'));

    b.initSvg?.(); b.render?.();
    return b;
  }

  // 2) 타입 판별
  const type = c.condition || c.platform || c.type || 'state';

  // (a) state
  if (type === 'state') {
    const entities = toArray(c.entity_id ?? c.entity);
    if (entities.length > 1) {
      const head = makeStateCondBlock(workspace, c, entities[0]);
      let tail = head;
      for (let i = 1; i < entities.length; i++) {
        const nb = makeStateCondBlock(workspace, c, entities[i]);
        if (tail && nb) connectNextChain(tail, nb), (tail = nb);
      }
      return head;
    }
    return makeStateCondBlock(workspace, c, entities[0]);
  }

  // (b) numeric_state (entity 전용)
  if (type === 'numeric_state') {
    // attribute가 있으면 아직은 미지원 블록 → 경고만
    if (c.attribute) {
      console.warn('[import] numeric_state with attribute is not mapped by entity block:', c);
    }
    const entities = toArray(c.entity_id ?? c.entity);
    if (!entities.length) return null;

    if (entities.length > 1) {
      const head = makeNumericStateEntityBlock(workspace, c, entities[0]);
      let tail = head;
      for (let i = 1; i < entities.length; i++) {
        const nb = makeNumericStateEntityBlock(workspace, c, entities[i]);
        if (tail && nb) connectNextChain(tail, nb), (tail = nb);
      }
      return head;
    }
    return makeNumericStateEntityBlock(workspace, c, entities[0]);
  }

  // TODO: template 등 필요 시 추가
  console.warn('[import] unsupported/unknown condition type for defined blocks:', type, c);
  return null;
}

export function createConditionsRoot(conds, workspace) {
  const list = toArray(conds);
  if (!list.length) return null;

  // 최상위: 여러 항목을 나열하면 AND 의미 → 직렬 체인
  const built = list.map(n => createSingleConditionNode(n, workspace)).filter(Boolean);
  if (!built.length) return null;

  let head = built[0], tail = head;
  for (let i = 1; i < built.length; i++) { connectNextChain(tail, built[i]); tail = built[i]; }
  return head;
}
