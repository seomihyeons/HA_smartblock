// src/import/blocks/condition_mapper.js
import * as Blockly from 'blockly';
import { createRawLinesBlock } from './raw_fallback.js';

const canCreate = (t) => !!Blockly.Blocks?.[t];
const set = (b, name, v) => { if (name && b.getField(name) && v != null) b.setFieldValue(String(v), name); };
const firstField = (b, list) => list.find(n => n && b.getField(n)) || null;
const toArray = (x) => (x == null ? [] : (Array.isArray(x) ? x : [x]));

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

function conditionToRawLines(c) {
  if (!c || typeof c !== 'object') return ['- ' + JSON.stringify(c)];
  const entries = Object.entries(c);
  if (!entries.length) return ['- {}'];

  const [firstK, firstV] = entries[0];
  const lines = [];
  emitYamlKey(lines, firstK, firstV, 2, true);
  for (let i = 1; i < entries.length; i++) {
    emitYamlKey(lines, entries[i][0], entries[i][1], 2, false);
  }
  return lines;
}

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

function ensureConditionDataInput(block) {
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
      .setCheck('HA_CONDITION_DATA')
      .appendField('data');
  } catch (_) {
    // ignore
  }
}

function parseHmsString(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    return { h: Number(m[1]), m: Number(m[2]), s: 0 };
  }
  m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]), s: Number(m[3]) };
}

function parseSignedHmsString(v) {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^([+-])?(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return {
    sign: m[1] === '-' ? '-' : '+',
    h: Number(m[2]),
    m: Number(m[3]),
    s: Number(m[4]),
  };
}

function extractTemplateExpression(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  if (!s) return '';
  const m = s.match(/^\{\{\s*([\s\S]*?)\s*\}\}$/);
  if (m) s = m[1].trim();
  return s;
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
    const attr = conditionObj?.attribute;
    return createRawLinesBlock(workspace, 'condition', [
      `- condition: state`,
      ...(eid ? [`  entity_id: ${eid}`] : [`  entity_id: ${JSON.stringify(eid ?? '')}`]),
      ...(attr != null && String(attr) !== '' ? [`  attribute: ${String(attr)}`] : []),
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
  const attrVal = String(conditionObj?.attribute || '').trim();
  const supportedCoverAttrs = new Set([
    'current_position',
    'current_cover_position',
    'current_tilt_position',
    'current_cover_tilt_position',
    'is_opening',
    'is_closing',
    'is_closed',
  ]);

  // cover 속성은 전용 모드로만 지원한다.
  if (attrVal && domain === 'cover' && !supportedCoverAttrs.has(attrVal)) {
    b.dispose(true);
    return rawStateLine();
  }

  if (domain === 'cover' && b.getField('STATE_KIND')) {
    const setStateKind = (kind) => setAndVerifyDropdown(b, 'STATE_KIND', kind);

    if (attrVal === 'current_position' || attrVal === 'current_cover_position') {
      if (!setStateKind('current_position')) {
        b.dispose(true);
        return rawStateLine();
      }
      if (b.getField('ATTR_NUMBER') && stateVal != null && stateVal !== '') {
        const n = Number(stateVal);
        if (!Number.isNaN(n)) b.setFieldValue(String(n), 'ATTR_NUMBER');
      }
      b.initSvg?.(); b.render?.();
      return b;
    }

    if (attrVal === 'current_tilt_position' || attrVal === 'current_cover_tilt_position') {
      if (!setStateKind('current_tilt_position')) {
        b.dispose(true);
        return rawStateLine();
      }
      if (b.getField('ATTR_NUMBER') && stateVal != null && stateVal !== '') {
        const n = Number(stateVal);
        if (!Number.isNaN(n)) b.setFieldValue(String(n), 'ATTR_NUMBER');
      }
      b.initSvg?.(); b.render?.();
      return b;
    }

    if (attrVal === 'is_opening') {
      if (!setStateKind('is_opening')) {
        b.dispose(true);
        return rawStateLine();
      }
      if (b.getField('ATTR_BOOL')) {
        const bv = String(stateVal).toLowerCase() === 'false' ? 'false' : 'true';
        b.setFieldValue(bv, 'ATTR_BOOL');
      }
      b.initSvg?.(); b.render?.();
      return b;
    }

    if (attrVal === 'is_closing') {
      if (!setStateKind('is_closing')) {
        b.dispose(true);
        return rawStateLine();
      }
      if (b.getField('ATTR_BOOL')) {
        const bv = String(stateVal).toLowerCase() === 'false' ? 'false' : 'true';
        b.setFieldValue(bv, 'ATTR_BOOL');
      }
      b.initSvg?.(); b.render?.();
      return b;
    }

    if (attrVal === 'is_closed') {
      if (!setStateKind('is_closed')) {
        b.dispose(true);
        return rawStateLine();
      }
      if (b.getField('ATTR_BOOL')) {
        const bv = String(stateVal).toLowerCase() === 'false' ? 'false' : 'true';
        b.setFieldValue(bv, 'ATTR_BOOL');
      }
      b.initSvg?.(); b.render?.();
      return b;
    }

    // plain cover state (open/closed/opening/closing/unavailable)
    if (typeof stateVal === 'string' && stateVal) {
      const okKind = setStateKind(stateVal);
      if (!okKind) {
        b.dispose(true);
        return rawStateLine();
      }
      b.initSvg?.(); b.render?.();
      return b;
    }
  }

  // sun 상태 문자열 보정 (dropdown value와 일치시키기)
  if (domain === 'sun' && typeof stateVal === 'string') {
    if (stateVal === 'above horizon') stateVal = 'above_horizon';
    if (stateVal === 'below horizon') stateVal = 'below_horizon';
  }

  // STATE dropdown 검증 (options에 없으면 기본값으로 떨어지므로 RAW)
  const allowUnknownState = domain === 'cover' ? false : true;
  const wantedState = (stateVal == null || stateVal === '') ? (b.getFieldValue('STATE') || '') : stateVal;
  const okState = setAndVerifyDropdown(b, 'STATE', wantedState, { allowUnknown: allowUnknownState });
  if (!okState && !(attrVal && domain !== 'cover')) {
    b.dispose(true);
    return rawStateLine();
  }

  if (attrVal && domain !== 'cover') {
    ensureConditionDataInput(b);

    if (canCreate('condition_data_attribute')) {
      const ab = workspace.newBlock('condition_data_attribute');
      if (ab.getField('VALUE')) ab.setFieldValue(String(attrVal), 'VALUE');
      ab.initSvg?.(); ab.render?.();
      appendStmt(b, ab, 'DATA');
    }

    if (stateVal != null && canCreate('condition_data_state')) {
      const sb = workspace.newBlock('condition_data_state');
      if (sb.getField('VALUE')) sb.setFieldValue(String(stateVal), 'VALUE');
      sb.initSvg?.(); sb.render?.();
      appendStmt(b, sb, 'DATA');
    }
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
  const hasAbove = above != null && !Number.isNaN(Number(above));
  const hasBelow = below != null && !Number.isNaN(Number(below));
  if (b.getField('USE_ABOVE')) set(b, 'USE_ABOVE', hasAbove ? 'TRUE' : 'FALSE');
  if (b.getField('USE_BELOW')) set(b, 'USE_BELOW', hasBelow ? 'TRUE' : 'FALSE');
  if (hasAbove) set(b, 'ABOVE', Number(above));
  if (hasBelow) set(b, 'BELOW', Number(below));
  if (typeof b.updateShape_ === 'function') b.updateShape_();

  b.initSvg?.(); b.render?.();
  return b;
}

function makeNumericStateAttributeBlock(workspace, conditionObj, eid) {
  const TYPE = 'condition_numeric_state_attribute';

  const rawNumericLines = () => createRawLinesBlock(workspace, 'condition', [
    `- condition: numeric_state`,
    ...(eid ? [`  entity_id: ${eid}`] : [`  entity_id: ${JSON.stringify(eid ?? '')}`]),
    ...(conditionObj?.attribute != null ? [`  attribute: ${conditionObj.attribute}`] : []),
    ...(conditionObj?.above != null ? [`  above: ${conditionObj.above}`] : []),
    ...(conditionObj?.below != null ? [`  below: ${conditionObj.below}`] : []),
  ]);

  if (!canCreate(TYPE)) return rawNumericLines();

  const b = workspace.newBlock(TYPE);

  const okEntity = setAndVerifyDropdown(b, 'ENTITY_ID', eid ?? '');
  if (!okEntity) {
    b.dispose(true);
    return rawNumericLines();
  }

  const okAttr = setAndVerifyDropdown(b, 'ATTRIBUTE', conditionObj?.attribute ?? '', { allowUnknown: true });
  if (!okAttr) {
    b.dispose(true);
    return rawNumericLines();
  }

  const above = conditionObj?.above;
  const below = conditionObj?.below;
  const hasAbove = above != null && !Number.isNaN(Number(above));
  const hasBelow = below != null && !Number.isNaN(Number(below));
  if (b.getField('USE_ABOVE')) set(b, 'USE_ABOVE', hasAbove ? 'TRUE' : 'FALSE');
  if (b.getField('USE_BELOW')) set(b, 'USE_BELOW', hasBelow ? 'TRUE' : 'FALSE');
  if (hasAbove) set(b, 'ABOVE', Number(above));
  if (hasBelow) set(b, 'BELOW', Number(below));
  if (typeof b.updateShape_ === 'function') b.updateShape_();

  b.initSvg?.(); b.render?.();
  return b;
}

function makeSunConditionBlock(workspace, c) {
  const rawSunLines = () => createRawLinesBlock(workspace, 'condition', conditionToRawLines(c));
  if (!canCreate('condition_sun')) return rawSunLines();

  const makeOffset = (v) => {
    if (v == null) return null;
    const offsetType = canCreate('condition_sun_offset')
      ? 'condition_sun_offset'
      : (canCreate('ha_event_offset') ? 'ha_event_offset' : null);
    if (!offsetType) return null;
    const parsed = parseSignedHmsString(String(v));
    if (!parsed) return null;
    const o = workspace.newBlock(offsetType);
    o.setFieldValue(parsed.sign, 'SIGN');
    o.setFieldValue(String(parsed.h).padStart(2, '0'), 'H');
    o.setFieldValue(String(parsed.m).padStart(2, '0'), 'M');
    o.setFieldValue(String(parsed.s).padStart(2, '0'), 'S');
    o.initSvg?.(); o.render?.();
    return o;
  };

  const makePart = (type, eventVal, offsetVal) => {
    if (!canCreate(type)) return null;
    if (!eventVal) return null;
    const p = workspace.newBlock(type);
    const okEvent = setAndVerifyDropdown(p, 'EVENT', eventVal, { allowUnknown: true });
    if (!okEvent) {
      p.dispose(true);
      return null;
    }
    if (offsetVal != null) {
      const off = makeOffset(offsetVal);
      if (!off) {
        p.dispose(true);
        return null;
      }
      const input = p.getInput('OFFSET');
      if (input?.connection && off.outputConnection) {
        input.connection.connect(off.outputConnection);
      }
    }
    p.initSvg?.(); p.render?.();
    return p;
  };

  const parts = [];
  if (c.after) {
    const p = makePart('condition_sun_after', c.after, c.after_offset);
    if (!p) return rawSunLines();
    parts.push(p);
  }
  if (c.before) {
    const p = makePart('condition_sun_before', c.before, c.before_offset);
    if (!p) return rawSunLines();
    parts.push(p);
  }

  if (!parts.length) return rawSunLines();

  const b = workspace.newBlock('condition_sun');
  b.initSvg?.(); b.render?.();

  const input = b.getInput('PARTS');
  if (!input?.connection) {
    b.dispose(true);
    return rawSunLines();
  }
  input.connection.connect(parts[0].previousConnection);
  for (let i = 1; i < parts.length; i++) {
    if (parts[i - 1].nextConnection && parts[i].previousConnection) {
      parts[i - 1].nextConnection.connect(parts[i].previousConnection);
    }
  }

  return b;
}

/* ========= public: conditions 루트 만들기 ========= */

function createSingleConditionNode(c, workspace, context = 'and') {
  if (!c) return null;

  // 1) 논리 그룹 (or/and/not)
  const logic = getLogicGroup(c);
  if (logic) {
    if (logic.op === 'not' && Array.isArray(logic.items) && logic.items.length === 1) {
      const one = createSingleConditionNode(logic.items[0], workspace, 'not');
      if (one && one.getInput && one.getInput('MOD') && canCreate('condition_not_value')) {
        const m = workspace.newBlock('condition_not_value');
        m.initSvg?.(); m.render?.();
        const input = one.getInput('MOD');
        const conn = input?.connection;
        if (conn && m.outputConnection) {
          conn.connect(m.outputConnection);
          one.initSvg?.(); one.render?.();
          return one;
        }
        m.dispose?.(true);
      }
      // Inline not(mod) 경로를 못 쓰는 경우, 미리 생성한 임시 노드를 정리한다.
      one?.dispose?.(true);
    }

    if (!canCreate('condition_logic')) {
      return createRawLinesBlock(workspace, 'condition', conditionToRawLines(c));
    }

    const b = workspace.newBlock('condition_logic');

    // LOGIC dropdown 검증 (없으면 기본값 떨어짐)
    const logicFieldName = firstField(b, ['LOGIC', 'Logic', 'logic']) || 'LOGIC';
    const want = String(logic.op || '').toUpperCase();
    const okLogic = setAndVerifyDropdown(b, logicFieldName, want);
    if (!okLogic) {
      b.dispose(true);
      return createRawLinesBlock(workspace, 'condition', conditionToRawLines(c));
    }

    const kids = (logic.items || [])
      .map(item => createSingleConditionNode(item, workspace, logic.op))
      .filter(Boolean);

    kids.forEach(child => appendStmt(b, child, 'SUBCONDITIONS'));

    b.initSvg?.(); b.render?.();
    return b;
  }

  // 2) 타입 판별
  const type = c.condition || c.platform || c.type || 'state';

  // (a) template
  const isShorthandTemplate =
    typeof c.condition === 'string' && /^\s*\{\{[\s\S]*\}\}\s*$/.test(c.condition);
  if (type === 'template' || isShorthandTemplate) {
    if (!canCreate('condition_template')) {
      return createRawLinesBlock(workspace, 'condition', conditionToRawLines(c));
    }

    const rawTemplate = c.value_template ?? (isShorthandTemplate ? c.condition : '');
    const expr = extractTemplateExpression(rawTemplate);
    if (!expr) {
      return createRawLinesBlock(workspace, 'condition', conditionToRawLines(c));
    }

    const b = workspace.newBlock('condition_template');
    if (b.getField('TEMPLATE')) b.setFieldValue(expr, 'TEMPLATE');
    b.initSvg?.();
    b.render?.();
    return b;
  }

  // (b) state
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

  // (c) numeric_state (entity 전용)
  if (type === 'numeric_state') {
    if (c.attribute) {
      const entities = toArray(c.entity_id ?? c.entity);
      if (!entities.length) {
        return createRawLinesBlock(workspace, 'condition', conditionToRawLines(c));
      }

      if (entities.length > 1) {
        const head = makeNumericStateAttributeBlock(workspace, c, entities[0]);
        let tail = head;
        for (let i = 1; i < entities.length; i++) {
          const nb = makeNumericStateAttributeBlock(workspace, c, entities[i]);
          if (tail && nb) connectNextChain(tail, nb), (tail = nb);
        }
        return head;
      }

      return makeNumericStateAttributeBlock(workspace, c, entities[0]);
    }

    const entities = toArray(c.entity_id ?? c.entity);
    if (!entities.length) {
      return createRawLinesBlock(workspace, 'condition', conditionToRawLines(c));
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

  // (d) sun
  if (type === 'sun') {
    return makeSunConditionBlock(workspace, c);
  }

  // (e) time
  if (type === 'time') {
    const lines = [`- condition: time`];
    if (c.after != null) lines.push(`  after: "${String(c.after)}"`);
    if (c.before != null) lines.push(`  before: "${String(c.before)}"`);
    if (c.weekday != null) lines.push(`  weekday: ${JSON.stringify(c.weekday)}`);

    const hasRange = c.after != null || c.before != null;
    const hasWeekday = c.weekday != null;
    // Split merged time conditions only in AND context.
    // In OR/NOT context, keep as raw to avoid semantic changes.
    if (hasRange && hasWeekday && context !== 'and') {
      return createRawLinesBlock(workspace, 'condition', lines);
    }

    const parts = [];

    if (c.after != null || c.before != null) {
      if (!canCreate('condition_time')) {
        return createRawLinesBlock(workspace, 'condition', lines);
      }
      const rb = workspace.newBlock('condition_time');
      rb.initSvg?.(); rb.render?.();

      const setSide = (side, rawVal) => {
        if (rawVal == null) return;
        const hms = parseHmsString(String(rawVal));
        if (hms) {
          rb.setFieldValue('TIME', `${side}_MODE`);
          if (rb.getField(`${side}_H`)) rb.setFieldValue(String(hms.h), `${side}_H`);
          if (rb.getField(`${side}_M`)) rb.setFieldValue(String(hms.m), `${side}_M`);
          if (rb.getField(`${side}_S`)) rb.setFieldValue(String(hms.s), `${side}_S`);
        } else {
          rb.setFieldValue('ENTITY', `${side}_MODE`);
          if (rb.getField(`${side}_ENTITY`)) {
            const ok = setAndVerifyDropdown(rb, `${side}_ENTITY`, String(rawVal));
            if (!ok) {
              throw new Error(`Unknown time entity for ${side.toLowerCase()}: ${String(rawVal)}`);
            }
          }
        }
      };

      rb.setFieldValue(c.after != null ? 'TRUE' : 'FALSE', 'USE_AFTER');
      rb.setFieldValue(c.before != null ? 'TRUE' : 'FALSE', 'USE_BEFORE');
      if (typeof rb.updateShape_ === 'function') rb.updateShape_();
      try {
        setSide('AFTER', c.after);
        setSide('BEFORE', c.before);
      } catch (_) {
        rb.dispose?.(true);
        return createRawLinesBlock(workspace, 'condition', lines);
      }
      rb.render?.();
      parts.push(rb);
    }

    if (c.weekday != null) {
      if (!canCreate('condition_time_weekly')) {
        return createRawLinesBlock(workspace, 'condition', lines);
      }
      const wb = workspace.newBlock('condition_time_weekly');
      const days = Array.isArray(c.weekday) ? c.weekday : [c.weekday];
      const map = { mon: 'MON', tue: 'TUE', wed: 'WED', thu: 'THU', fri: 'FRI', sat: 'SAT', sun: 'SUN' };
      for (const d of days) {
        const key = map[String(d).toLowerCase()];
        if (key && wb.getField(key)) wb.setFieldValue('TRUE', key);
      }
      wb.initSvg?.(); wb.render?.();
      parts.push(wb);
    }

    if (!parts.length) return createRawLinesBlock(workspace, 'condition', lines);
    let head = parts[0];
    let tail = head;
    for (let i = 1; i < parts.length; i++) {
      connectNextChain(tail, parts[i]);
      tail = parts[i];
    }
    return head;
  }

  // 미지원 타입 → RAW로
  return createRawLinesBlock(workspace, 'condition', conditionToRawLines(c));
}

export function createConditionsRoot(conds, workspace) {
  const list = toArray(conds);
  if (!list.length) return null;

  const built = list
    .map(n => createSingleConditionNode(n, workspace, 'and'))
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
