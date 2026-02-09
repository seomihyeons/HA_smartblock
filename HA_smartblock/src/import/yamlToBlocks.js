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
    setIdIfPresent(root, autoJson);
  }
  return root;
}

/* ----------- conditions 형태 보정(normalize) ----------- */
function unwrapItems(node) {
  if (node && typeof node === 'object' && Array.isArray(node.items)) return node.items;
  return node;
}

function normalizeSingleCondShape(c) {
  if (!c || typeof c !== 'object') return c;

  if (c.condition === 'or' || c.condition === 'and' || c.condition === 'not') {
    const list = unwrapItems(c.conditions) || c.conditions;
    const arr = Array.isArray(list) ? list : list ? [list] : [];
    const key = c.condition;
    return { [key]: arr.map(normalizeSingleCondShape) };
  }

  return c;
}

function normalizeConditionsShape(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(normalizeSingleCondShape);
  const maybe = unwrapItems(raw);
  if (Array.isArray(maybe)) return maybe.map(normalizeSingleCondShape);
  return [normalizeSingleCondShape(raw)];
}

/* -------------------- NEW: YAML dump (raw 블록에 넣을 텍스트 재구성) -------------------- */
/**
 * 원본 YAML 문자열을 그대로 보존하려면 yaml_import 단계에서 "섹션별 원문"을 저장해야 하지만,
 * 지금 구조(autoJson만 있는 상태)에서는 섹션 내용을 최대한 YAML 형태로 "재구성"해서 raw 필드에 넣는다.
 */
const IND = '  ';
function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}
function quoteIfNeeded(s) {
  // 너무 공격적으로 따옴표 치면 HA 예제 느낌이 깨져서 최소만.
  // 숫자/true/false/null 같은 경우는 그대로 두고, 나머지 문자열은 작은따옴표로 감싼다.
  const str = String(s);
  if (
    str === 'true' || str === 'false' || str === 'null' ||
    /^[0-9]+(\.[0-9]+)?$/.test(str)
  ) return str;
  // {{ ... }} 템플릿은 보통 따옴표 없이도 쓰지만, 안전하게 감싸도 동작함.
  // 여기서는 최소 변경 원칙으로 템플릿 포함 시도 그냥 따옴표.
  return `'${str.replace(/'/g, "''")}'`;
}

function dumpYamlValue(v, indent = 0) {
  const pad = IND.repeat(indent);

  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return quoteIfNeeded(v);

  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    // 리스트는 항상 블록 형태로
    let out = '\n';
    for (const item of v) {
      if (isPlainObject(item)) {
        out += `${pad}- ${dumpYamlObjectInlineFirst(item, indent)}\n`;
      } else if (Array.isArray(item)) {
        out += `${pad}- ${dumpYamlValue(item, indent + 1)}\n`;
      } else {
        out += `${pad}- ${dumpYamlValue(item, 0)}\n`;
      }
    }
    return out.trimEnd();
  }

  if (isPlainObject(v)) {
    const keys = Object.keys(v);
    if (keys.length === 0) return '{}';
    let out = '\n';
    for (const k of keys) {
      const val = v[k];
      if (isPlainObject(val) || Array.isArray(val)) {
        out += `${pad}${k}: ${dumpYamlValue(val, indent + 1)}\n`;
      } else {
        out += `${pad}${k}: ${dumpYamlValue(val, 0)}\n`;
      }
    }
    return out.trimEnd();
  }

  return quoteIfNeeded(String(v));
}

// "- key: value" 형태에서 첫 줄을 예쁘게 만들기 위한 helper
function dumpYamlObjectInlineFirst(obj, indent) {
  // 첫 키를 "- key: ..." 로 두고 나머지는 아래 줄로 내림
  const keys = Object.keys(obj || {});
  if (keys.length === 0) return '{}';
  const firstKey = keys[0];
  const restKeys = keys.slice(1);

  const firstVal = obj[firstKey];
  let line = '';

  if (isPlainObject(firstVal) || Array.isArray(firstVal)) {
    line += `${firstKey}: ${dumpYamlValue(firstVal, indent + 1)}`;
  } else {
    line += `${firstKey}: ${dumpYamlValue(firstVal, 0)}`;
  }

  if (restKeys.length === 0) return line;

  // 나머지 키는 다음 줄부터 같은 indent+1 레벨로
  const pad = IND.repeat(indent + 1);
  let out = line;
  for (const k of restKeys) {
    const v = obj[k];
    if (isPlainObject(v) || Array.isArray(v)) {
      out += `\n${pad}${k}: ${dumpYamlValue(v, indent + 2)}`;
    } else {
      out += `\n${pad}${k}: ${dumpYamlValue(v, 0)}`;
    }
  }
  return out;
}

function dumpSectionListYaml(sectionValue) {
  // 섹션은 보통 리스트 형태([- ...])라서, array로 맞춘 뒤 리스트 YAML을 만든다.
  let arr = [];
  if (Array.isArray(sectionValue)) arr = sectionValue;
  else if (sectionValue) arr = [sectionValue];

  // 각 아이템이 object일 때 "- key: ..." 형태로
  let out = '';
  for (const item of arr) {
    if (isPlainObject(item)) {
      out += `- ${dumpYamlObjectInlineFirst(item, 0)}\n`;
    } else {
      out += `- ${dumpYamlValue(item, 0)}\n`;
    }
  }
  return out.trimEnd() + (out ? '\n' : '');
}

function createRawBlock(ws, type, rawYamlText) {
  if (!canCreate(type)) return null;
  const b = ws.newBlock(type);
  // 라벨 없는 %1 + field_multiline_input(YAML) 전제
  const f = b.getField('YAML');
  if (f) b.setFieldValue(String(rawYamlText || ''), 'YAML');
  b.initSvg();
  b.render();
  return b;
}

/* -------------------- 메인 엔트리 -------------------- */
export function renderAutomationToWorkspace(ws, autoJson, opts = {}) {
  const { clearBefore = true } = opts;
  if (clearBefore) ws.clear();

  const root = ensureRoot(ws, autoJson?.alias || 'New Automation', autoJson);
  const IN_EVENT = root ? findStmtInput(root, ['Event', 'EVENT']) : null;
  const IN_COND = root ? findStmtInput(root, ['Condition', 'CONDITION']) : null;
  const IN_ACTION = root ? findStmtInput(root, ['Action', 'ACTION']) : null;

  /* ---------------- Triggers ---------------- */
  const triggers = Array.isArray(autoJson?.triggers)
    ? autoJson.triggers
    : Array.isArray(autoJson?.trigger)
    ? autoJson.trigger
    : [];

  if (triggers.length) {
    const created = [];
    let allOk = true;

    triggers.forEach((t) => {
      const b = createTriggerBlock(t, ws);
      if (!b) {
        allOk = false;
        return;
      }
      setIdIfPresent(b, t);
      created.push(b);
    });

    if (allOk && created.length === triggers.length) {
      created.forEach((b, i) => {
        b.initSvg();
        b.render();
        if (root && IN_EVENT) appendChild(root, b, IN_EVENT);
        else b.moveBy(80, 120 + i * 80);
      });
    } else {
      // 이미 만들어진 개별 블록들 제거(섹션 전체 fallback이므로)
      created.forEach((b) => b.dispose(false));

      const rawText = dumpSectionListYaml(triggers);
      const rawBlock = createRawBlock(ws, 'ha_triggers_raw', rawText);
      if (rawBlock) {
        if (root && IN_EVENT) appendChild(root, rawBlock, IN_EVENT);
        else rawBlock.moveBy(80, 120);
      }
    }
  }

  /* ---------------- Conditions ---------------- */
  const rawConds = autoJson?.conditions || autoJson?.condition;
  const condList = normalizeConditionsShape(rawConds);

  if (condList.length) {
    // ✅ 여기서는 "조건 트리 내부 일부만 실패"를 yamlToBlocks.js가 알기 어려움.
    // 그래서 condition_mapper 쪽이 "부분 실패 시 null/throw" 하도록 맞추는 게 가장 안전.
    // 일단은 createConditionsRoot가 null이면 fallback.
    let condRoot = null;
    let condOk = true;

    try {
      condRoot = createConditionsRoot(condList, ws);
      if (!condRoot) condOk = false;
    } catch (e) {
      condOk = false;
      condRoot = null;
    }

    if (condOk && condRoot) {
      condRoot.initSvg();
      condRoot.render();
      if (root && IN_COND) appendChild(root, condRoot, IN_COND);
      else condRoot.moveBy(80, 260);
    } else {
      if (condRoot) condRoot.dispose(false);

      // 조건은 normalize 이전의 원본(rawConds)을 그대로 YAML로 재구성해서 넣는다
      const rawText = dumpSectionListYaml(Array.isArray(rawConds) ? rawConds : rawConds ? [rawConds] : []);
      const rawBlock = createRawBlock(ws, 'ha_conditions_raw', rawText);
      if (rawBlock) {
        if (root && IN_COND) appendChild(root, rawBlock, IN_COND);
        else rawBlock.moveBy(80, 260);
      }
    }
  }

  /* ---------------- Actions ---------------- */
  const actions = Array.isArray(autoJson?.actions)
    ? autoJson.actions
    : Array.isArray(autoJson?.action)
    ? autoJson.action
    : [];

  if (actions.length) {
    const created = [];
    let allOk = true;

    actions.forEach((a) => {
      const b = createActionNode(a, ws);
      if (!b) {
        allOk = false;
        return;
      }
      setIdIfPresent(b, a);
      created.push(b);
    });

    if (allOk && created.length === actions.length) {
      created.forEach((b, i) => {
        b.initSvg();
        b.render();
        if (root && IN_ACTION) appendChild(root, b, IN_ACTION);
        else b.moveBy(80, 360 + i * 80);
      });
    } else {
      created.forEach((b) => b.dispose(false));

      const rawText = dumpSectionListYaml(actions);
      const rawBlock = createRawBlock(ws, 'ha_actions_raw', rawText);
      if (rawBlock) {
        if (root && IN_ACTION) appendChild(root, rawBlock, IN_ACTION);
        else rawBlock.moveBy(80, 360);
      }
    }
  }

  Blockly.svgResize(ws);
}
