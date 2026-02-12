// src/import/blocks/condition_mapper.js
import * as Blockly from 'blockly';
import { createRawLinesBlock } from './raw_fallback.js';

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
  while (tail.nextConnection && tail.nextConnection.targetBlock()) {
    tail = tail.nextConnection.targetBlock();
  }
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

    const nextCur = String(f.getValue?.() ?? '');
    return opts.includes(want) && nextCur === want;
  }

  if (value != null) block.setFieldValue(String(value), fieldName);
  const cur = String(f.getValue?.() ?? '');
  return cur === String(value ?? '');
}

// 논리 그룹 감지: {or:[...]} / {and:[...]} / {not:[...]}  (구문 혼합도 수용)
function getLogicGroup(c) {
  if (!c || typeof c !== 'object') return null;

  for (const key of ['or', 'and', 'not']) {
    if (Array.isArray(c[key])) return { op: key, items: c[key] };
  }

  if (
    ['or', 'and', 'not'].includes(c.condition) &&
    (Array.isArray(c.conditions) || Array.isArray(c?.conditions?.items))
  ) {
    const list = Array.isArray(c.conditions)
      ? c.conditions
      : Array.isArray(c?.conditions?.items)
        ? c.conditions.items
        : [];
    return { op: c.condition, items: list };
  }

  return null;
}

/* ========= state 조건 전용 생성기 (condition_state_<domain>) ========= */

function makeStateCondBlock(workspace, conditionObj, eid) {
  const domain = domainFromEntityId(eid);

  const rawStateLine = () => {
    const s = Array.isArray(conditionObj?.state)
      ? (conditionObj.state[0] ?? '')
      : (conditionObj?.state ?? conditionObj?.to ?? '');
    return createRawLinesBlock(workspace, 'condition', [
      `- condition: state`,
      ...(eid ? [`  entity_id: ${eid}`] : [`  entity_id: ${JSON.stringify(eid ?? '')}`]),
      ...(s !== '' && s != null ? [`  state: ${JSON.stringify(s)}`] : []),
    ]);
  };

  if (!domain) return rawStateLine();

  const TYPE = `condition_state_${domain}`;
  if (!canCreate(TYPE)) return rawStateLine();

  const b = workspace.newBlock(TYPE);

  // ENTITY_ID dropdown 검증
  const okEntity = setAndVerifyDropdown(b, 'ENTITY_ID', eid ?? '');
  if (!okEntity) {
    b.dispose(true);
    return rawStateLine();
  }

  let stateVal = Array.isArray(conditionObj?.state)
    ? (conditionObj.state[0] ?? '')
    : (conditionObj?.state ?? conditionObj?.to ?? '');

  // sun 상태 문자열 보정 (dropdown value와 일치시키기)
  if (domain === 'sun' && typeof stateVal === 'string') {
    if (stateVal === 'above horizon') stateVal = 'above_horizon';
    if (stateVal === 'below horizon') stateVal = 'below_horizon';
  }

  // STATE dropdown 검증 (options에 없으면 기본값으로 떨어지므로 RAW)
  const okState = setAndVerifyDropdown(b, 'STATE', stateVal ?? '', { allowUnknown: true });
  if (!okState) {
    b.dispose(true);
    return rawStateLine();
  }

  b.initSvg?.(); b.render?.();
  return b;
}

/* ========= numeric_state (entity) 생성기 ========= */

function makeNumericStateEntityBlock(workspace, conditionObj, eid) {
  const TYPE = 'condition_numeric_state_entity';

  const rawNumericLines = () => createRawLinesBlock(workspace, 'condition', [
    `- condition: numeric_state`,
    ...(eid ? [`  entity_id: ${eid}`] : [`  entity_id: ${JSON.stringify(eid ?? '')}`]),
    ...(conditionObj?.above != null ? [`  above: ${conditionObj.above}`] : []),
    ...(conditionObj?.below != null ? [`  below: ${conditionObj.below}`] : []),
  ]);

  if (!canCreate(TYPE)) return rawNumericLines();

  const b = workspace.newBlock(TYPE);

  // ENTITY_ID dropdown 검증
  const okEntity = setAndVerifyDropdown(b, 'ENTITY_ID', eid ?? '');
  if (!okEntity) {
    b.dispose(true);
    return rawNumericLines();
  }

  const above = conditionObj?.above;
  const below = conditionObj?.below;
  if (above != null && !Number.isNaN(Number(above))) set(b, 'ABOVE', Number(above));
  if (below != null && !Number.isNaN(Number(below))) set(b, 'BELOW', Number(below));

  b.initSvg?.(); b.render?.();
  return b;
}

/* ========= public: conditions 루트 만들기 ========= */

function createSingleConditionNode(c, workspace) {
  if (!c) return null;

  // 1) 논리 그룹 (or/and/not)
  const logic = getLogicGroup(c);
  if (logic) {
    if (!canCreate('condition_logic')) {
      return createRawLinesBlock(workspace, 'condition', ['- ' + JSON.stringify(c)]);
    }

    const b = workspace.newBlock('condition_logic');

    // LOGIC dropdown 검증 (없으면 기본값 떨어짐)
    const logicFieldName = firstField(b, ['LOGIC', 'Logic', 'logic']) || 'LOGIC';
    const want = String(logic.op || '').toUpperCase();
    const okLogic = setAndVerifyDropdown(b, logicFieldName, want);
    if (!okLogic) {
      b.dispose(true);
      return createRawLinesBlock(workspace, 'condition', ['- ' + JSON.stringify(c)]);
    }

    const kids = (logic.items || [])
      .map(item => createSingleConditionNode(item, workspace))
      .filter(Boolean);

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
    // attribute 포함 numeric_state는 현재 블록 미지원 → RAW로
    if (c.attribute) {
      return createRawLinesBlock(workspace, 'condition', [
        `- condition: numeric_state`,
        ...(c.entity_id != null
          ? [`  entity_id: ${Array.isArray(c.entity_id) ? JSON.stringify(c.entity_id) : c.entity_id}`]
          : []),
        `  attribute: ${c.attribute}`,
        ...(c.above != null ? [`  above: ${c.above}`] : []),
        ...(c.below != null ? [`  below: ${c.below}`] : []),
      ]);
    }

    const entities = toArray(c.entity_id ?? c.entity);
    if (!entities.length) {
      return createRawLinesBlock(workspace, 'condition', ['- ' + JSON.stringify(c)]);
    }

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

  // 미지원 타입 → RAW로
  return createRawLinesBlock(workspace, 'condition', ['- ' + JSON.stringify(c)]);
}

export function createConditionsRoot(conds, workspace) {
  const list = toArray(conds);
  if (!list.length) return null;

  const built = list
    .map(n => createSingleConditionNode(n, workspace))
    .filter(Boolean);

  if (!built.length) return null;

  let head = built[0];
  let tail = head;
  for (let i = 1; i < built.length; i++) {
    connectNextChain(tail, built[i]);
    tail = built[i];
  }

  return head;
}
