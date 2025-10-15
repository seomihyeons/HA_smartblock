// src/import/yamlToBlocks.js
import * as Blockly from 'blockly';
import { createTriggerBlock } from './blocks/trigger_mapper';
import { createConditionsRoot } from './blocks/condition_mapper';
import { createActionNode } from './blocks/action_mapper';

const ROOT_BLOCK_TYPE = 'event_condition_action';

/* -------------------- 유틸리티 -------------------- */
const firstField = (b, list) => list.find((n) => n && b.getField(n)) || null;

function findStmtInput(b, preferred = []) {
  if (!b || !b.inputList) return null;
  const prefLC = preferred.map((s) => String(s).toLowerCase());
  // Blockly ESM: 입력 타입 판별은 i.type === Blockly.NEXT_STATEMENT 를 사용
  const byPref = b.inputList.find(
    (i) =>
      i.type === Blockly.NEXT_STATEMENT &&
      prefLC.includes((i.name || '').toLowerCase())
  );
  if (byPref) return byPref.name;
  const any = b.inputList.find((i) => i.type === Blockly.NEXT_STATEMENT);
  return any ? any.name : null;
}

function appendChild(parent, child, inputName) {
  if (!inputName) return;
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

const canCreate = (t) => !!Blockly.Blocks?.[t];

// 공통: obj.id가 있으면 블록의 ID/Id/id 필드에 채움
function setIdIfPresent(block, obj) {
  if (!obj || obj.id == null) return;
  const idField = firstField(block, ['ID', 'Id', 'id']);
  if (idField) block.setFieldValue(String(obj.id), idField);
}

function ensureRoot(ws, aliasText, autoJson) {
  let root = ws.getTopBlocks(true).find((b) => b.type === ROOT_BLOCK_TYPE);
  if (!root && canCreate(ROOT_BLOCK_TYPE)) {
    root = ws.newBlock(ROOT_BLOCK_TYPE);
    root.initSvg();
    root.render();
    root.moveBy(520, 100);
  }
  if (root) {
    const aliasField = firstField(root, ['Name', 'ALIAS', 'TITLE']);
    if (aliasField && aliasText) root.setFieldValue(String(aliasText), aliasField);
    // 루트에 id가 있으면 표기
    setIdIfPresent(root, autoJson);
  }
  return root;
}

/* ----------- conditions 형태 보정(normalize) ----------- */
// { items:[...] } 래퍼를 풀어준다
function unwrapItems(node) {
  if (node && typeof node === 'object' && Array.isArray(node.items)) return node.items;
  return node;
}

// 단일 조건/논리 조건을 통일된 형태로
function normalizeSingleCondShape(c) {
  if (!c || typeof c !== 'object') return c;

  // 논리 연산: {condition:'or'|'and'|'not', conditions:{items:[...]|[...]} }
  if (c.condition === 'or' || c.condition === 'and' || c.condition === 'not') {
    const list = unwrapItems(c.conditions) || c.conditions;
    const arr = Array.isArray(list) ? list : list ? [list] : [];
    const key = c.condition; // 'or' | 'and' | 'not'
    return { [key]: arr.map(normalizeSingleCondShape) };
  }

  // 기타 단일 조건은 그대로
  return c;
}

// 전체 conditions를 배열 형태로 통일
function normalizeConditionsShape(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(normalizeSingleCondShape);
  const maybe = unwrapItems(raw);
  if (Array.isArray(maybe)) return maybe.map(normalizeSingleCondShape);
  // 단일 객체만 온 경우
  return [normalizeSingleCondShape(raw)];
}

/* -------------------- 메인 엔트리 -------------------- */
export function renderAutomationToWorkspace(ws, autoJson, opts = {}) {
  const { clearBefore = true } = opts; // YAML import 시 초기화하는 것이 자연스러움
  if (clearBefore) ws.clear();

  const root = ensureRoot(ws, autoJson?.alias || 'New Automation', autoJson);
  const IN_EVENT = root ? findStmtInput(root, ['Event', 'EVENT']) : null;
  const IN_COND = root ? findStmtInput(root, ['Condition', 'CONDITION']) : null;
  const IN_ACTION = root ? findStmtInput(root, ['Action', 'ACTION']) : null;

  /* Triggers */
  const triggers = Array.isArray(autoJson?.triggers)
    ? autoJson.triggers
    : Array.isArray(autoJson?.trigger)
    ? autoJson.trigger
    : [];
  if (triggers.length) {
    triggers.forEach((t, i) => {
      const b = createTriggerBlock(t, ws);
      if (!b) return;
      // ← 트리거 블록에 id 표기
      setIdIfPresent(b, t);
      b.initSvg();
      b.render();
      if (root && IN_EVENT) appendChild(root, b, IN_EVENT);
      else b.moveBy(80, 120 + i * 80);
    });
  }

  /* Conditions (형태 보정 후 매핑)
     ※ 조건 내부의 개별 블록에 id를 표기하려면 condition_mapper.js에서
        블록 생성 직후 setIdIfPresent(childBlock, conditionObj)를 호출하도록
        한 줄 추가해 주세요. (원하면 패치 파일 제공 가능)
  */
  const condList = normalizeConditionsShape(autoJson?.conditions || autoJson?.condition);
  if (condList.length) {
    const condRoot = createConditionsRoot(condList, ws);
    if (condRoot) {
      // 그룹 자체에 id가 있었다면 여기서 표기하고 싶으면 condList의 루트 개체에서 꺼내야 하는데
      // 현재 normalize에서 그룹을 { or:[...] } 형태로 바꾸므로 id는 보존되지 않습니다.
      // 필요 시 normalizeSingleCondShape에서 id를 옮겨 보존하도록 확장하세요.
      condRoot.initSvg();
      condRoot.render();
      if (root && IN_COND) appendChild(root, condRoot, IN_COND);
      else condRoot.moveBy(80, 260);
    }
  }

  /* Actions */
  const actions = Array.isArray(autoJson?.actions)
    ? autoJson.actions
    : Array.isArray(autoJson?.action)
    ? autoJson.action
    : [];
  if (actions.length) {
    actions.forEach((a, i) => {
      const b = createActionNode(a, ws);
      if (!b) return;
      // ← 액션 블록에 id 표기
      setIdIfPresent(b, a);
      b.initSvg();
      b.render();
      if (root && IN_ACTION) appendChild(root, b, IN_ACTION);
      else b.moveBy(80, 360 + i * 80);
    });
  }

  Blockly.svgResize(ws);
}
