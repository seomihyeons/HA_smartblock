// src/import/yaml_import.js

// 경량 파서 + 정규화 (외부 의존성 없음)
export function yamlTextToInternalJson(yamlText) {
  // 원시 파싱
  let obj = parseYamlLite(yamlText);
  // 루트 풀기: {items:[...]} → [...], 단일이면 {} 그대로
  obj = unwrapRoot(obj);
  // Home Assistant 자동화는 보통 목록의 첫 요소이거나 단일 객체
  const auto = Array.isArray(obj) ? (obj[0] || {}) : obj;
  // 내부 구조 정규화
  const normalized = normalizeAutomationObject(auto);
  // 디버그: entity 배열이 제대로 들어왔는지 확인용
  // console.log('[DEBUG] actions(normalized)=', JSON.stringify(normalized.actions, null, 2));
  return normalized;
}

/* ===================== 경량 YAML 파서(보강판) ===================== */
function parseYamlLite(text) {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'));

  const root = { __type: 'map', value: {} };
  const stack = [{ indent: -1, node: root }];

  const INDENT_RE = /^(\s*)(.*)$/;
  const stripQuotes = (s) => {
    const t = s.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
    return t;
  };
  const wrapScalar = (s) => {
    const str = stripQuotes(s);
    // 인라인 배열도 처리: [a, b, c]
    if (str.startsWith('[') && str.endsWith(']')) {
      const inner = str.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(',').map(x => stripQuotes(x).trim()).filter(x => x.length > 0);
    }
    if (/^(true|false)$/i.test(str)) return str.toLowerCase() === 'true';
    if (/^(null|~)$/i.test(str)) return null;
    if (/^-?\d+(\.\d+)?$/.test(str)) return Number(str);
    return str;
  };
  const unwrap = (node) => {
    if (!node || typeof node !== 'object' || !node.__type) return node;
    if (node.__type === 'map') {
      // map인데 key가 'items' 하나뿐이면 내부 시퀀스를 바로 풀어줌
      const keys = Object.keys(node.value);
      if (keys.length === 1 && keys[0] === 'items' && node.value.items?.__type === 'seq') {
        return unwrap(node.value.items);
      }
      const out = {};
      for (const [k, v] of Object.entries(node.value)) out[k] = unwrap(v);
      return out;
    }
    if (node.__type === 'seq') {
      return node.value.map(unwrap);
    }
    return node;
  };
  const current = () => stack[stack.length - 1];
  const popTo = (indent) => { while (stack.length > 1 && current().indent >= indent) stack.pop(); };

  for (const raw of lines) {
    const m = raw.match(INDENT_RE); if (!m) continue;
    const indent = m[1].length, content = m[2];
    popTo(indent);
    const parent = current().node;

    const isSeq = content.trimStart().startsWith('- ');
    if (isSeq) {
      const after = content.trimStart().slice(2);
      let seqNode = parent;

      // 부모가 map이면, 마지막 키 아래 시퀀스를 배치
      if (parent.__type === 'map') {
        const keys = Object.keys(parent.value);
        const lastKey = keys[keys.length - 1];
        // 마지막 키가 없거나(빈 map) / 마지막 값이 시퀀스가 아니면 새 시퀀스 생성
        if (!lastKey || !parent.value[lastKey] || parent.value[lastKey].__type !== 'seq') {
          parent.value[lastKey ?? 'items'] = { __type: 'seq', value: [] };
        }
        seqNode = parent.value[lastKey ?? 'items'];
      }

      if (after.includes(':')) {
        const idx = after.indexOf(':');
        const key = after.slice(0, idx).trim();
        const vStr = after.slice(idx + 1).trim();
        const mapNode = { __type: 'map', value: {} };
        mapNode.value[key] = vStr ? wrapScalar(vStr) : { __type: 'map', value: {} };
        seqNode.value.push(mapNode);
        stack.push({ indent, node: mapNode });
      } else {
        const scalar = wrapScalar(after.trim());
        // 인라인 배열이 들어온 경우 한 번에 여러 항목으로 펼침
        if (Array.isArray(scalar)) {
          for (const it of scalar) seqNode.value.push(it);
        } else {
          seqNode.value.push(scalar);
        }
        // 시퀀스 자체를 스택에 올려 동일 indent의 다음 '-'를 같은 시퀀스로 계속 수용
        stack.push({ indent, node: seqNode });
      }
    } else {
      const idx = content.indexOf(':'); if (idx === -1) continue;
      const key = content.slice(0, idx).trim();
      const vStr = content.slice(idx + 1).trim();
      let mapNode = parent;
      if (parent.__type === 'seq') {
        mapNode = { __type: 'map', value: {} };
        parent.value.push(mapNode);
        stack.push({ indent, node: mapNode });
      }
      if (vStr) {
        const wrapped = wrapScalar(vStr);
        // 인라인 배열이면 곧바로 시퀀스 노드로 저장
        if (Array.isArray(wrapped)) {
          mapNode.value[key] = { __type: 'seq', value: wrapped };
        } else {
          mapNode.value[key] = wrapped;
        }
      } else {
        mapNode.value[key] = { __type: 'map', value: {} };
        stack.push({ indent, node: mapNode.value[key] });
      }
    }
  }
  return unwrap(root);
}

/* ===================== 정규화 유틸 ===================== */

// 루트가 {items:[...]}면 풀기
function unwrapRoot(obj) {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj;
  if (typeof obj === 'object' && Array.isArray(obj.items)) return obj.items;
  return obj;
}

// {items:[...]} → [...], 배열이면 그대로, 단일이면 [단일]
function unwrapItems(node) {
  if (node == null) return node;
  if (Array.isArray(node)) return node;
  if (typeof node === 'object' && Array.isArray(node.items)) return node.items;
  return node;
}
function toArray(node) {
  const unwrapped = unwrapItems(node);
  if (unwrapped == null) return [];
  if (Array.isArray(unwrapped)) return unwrapped;
  return [unwrapped];
}

// 문자열이지만 "a,b" 또는 "a, b" 식으로 들어온 케이스 방어
function splitMaybeListString(str) {
  if (typeof str !== 'string') return null;
  if (!str.includes(',')) return null;
  const parts = str.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length <= 1) return null;
  return parts;
}

function normalizeFor(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    const m = v.match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (m) return { hours: +m[1], minutes: +m[2], seconds: +m[3] };
    if (/^\d+$/.test(v)) {
      const s = +v; return { hours: (s/3600)|0, minutes: ((s%3600)/60)|0, seconds: s%60 };
    }
    return { hours: 0, minutes: 0, seconds: 0 };
  }
  if (typeof v === 'number') {
    const s = v|0; return { hours: (s/3600)|0, minutes: ((s%3600)/60)|0, seconds: s%60 };
  }
  if (typeof v === 'object' && v !== null)
    return { hours: +(v.hours||0), minutes: +(v.minutes||0), seconds: +(v.seconds||0) };
  return null;
}

// "-HH:MM:SS" | "+HH:MM:SS" | "HH:MM:SS" | "H:MM:SS" | {sign,hours,minutes,seconds}
function normalizeSunOffset(v) {
  if (v == null) return null;

  if (typeof v === 'string') {
    const s = v.trim();
    const m = s.match(/^([+-])?(\d{1,2}):(\d{2}):(\d{2})$/);
    if (!m) return null;
    const hours = Math.max(0, parseInt(m[2], 10) || 0);
    const minutes = Math.max(0, parseInt(m[3], 10) || 0);
    const seconds = Math.max(0, parseInt(m[4], 10) || 0);
    if (hours === 0 && minutes === 0 && seconds === 0) return null;
    return { sign: (m[1] === '-') ? '-' : '+', hours, minutes, seconds };
  }

  if (typeof v === 'object') {
    const hours = Math.max(0, parseInt(v.hours, 10) || 0);
    const minutes = Math.max(0, parseInt(v.minutes, 10) || 0);
    const seconds = Math.max(0, parseInt(v.seconds, 10) || 0);
    if (hours === 0 && minutes === 0 && seconds === 0) return null;
    return { sign: (v.sign === '-') ? '-' : '+', hours, minutes, seconds };
  }

  return null;
}

function normalizeEntityList(maybe) {
  // 1) {items:[...]} or array
  const unwrapped = unwrapItems(maybe);
  if (Array.isArray(unwrapped)) {
    return unwrapped.map(String);
  }
  // 2) 인라인 배열을 이미 스칼라가 파싱한 경우: 문자열 "a, b"
  const split = splitMaybeListString(unwrapped);
  if (split) return split;
  // 3) 단일 스칼라
  if (unwrapped == null) return [];
  return [String(unwrapped)];
}

function normalizeTarget(t) {
  if (!t || typeof t !== 'object') {
    // 타겟이 통째로 누락되거나 비표준 형태면 그대로 반환
    return t;
  }
  const out = { ...t };

  if (out.entity_id != null) {
    out.entity_id = normalizeEntityList(out.entity_id);
  }
  if (out.area_id != null) {
    out.area_id = normalizeEntityList(out.area_id);
  }
  if (out.device_id != null) {
    out.device_id = normalizeEntityList(out.device_id);
  }

  return out;
}

/* ---------- 조건 정규화 ---------- */
// 조건 1건 정규화: entity/entity_id 배열화, state 배열 허용, for/target 표준화
function normalizeSingleCondition(c) {
  if (!c || typeof c !== 'object') return c;

  // 이미 {or}/{and}/{not} 논리 노드면 재귀 정리
  if (Array.isArray(c.or) || Array.isArray(c.and) || Array.isArray(c.not)) {
    const out = { ...c };
    if (out.or)  out.or  = toArray(out.or).map(normalizeSingleCondition);
    if (out.and) out.and = toArray(out.and).map(normalizeSingleCondition);
    if (out.not) out.not = toArray(out.not).map(normalizeSingleCondition);
    return out;
  }

  // condition: or/and/not + conditions: [...]
  if (c.condition === 'or' || c.condition === 'and' || c.condition === 'not') {
    const inner = toArray(c.conditions);
    const arr = inner.map(normalizeSingleCondition);
    if (c.condition === 'or')  return { or: arr };
    if (c.condition === 'and') return { and: arr };
    return { not: arr };
  }

  const out = { ...c };

  // 공통: for/target 정리
  if (out.for != null) out.for = normalizeFor(out.for);
  if (out.target) out.target = normalizeTarget(out.target);

  // entity 별칭 보정 (entity → entity_id)
  if (out.entity != null && out.entity_id == null) {
    out.entity_id = out.entity;
    delete out.entity;
  }

  // entity_id 배열 표준화 (단일/배열/{items:[...]}/중복키 보정/쉼표 문자열 모두 흡수)
  if (out.entity_id != null) {
    out.entity_id = normalizeEntityList(out.entity_id);
  }

  // state 조건: state를 배열 허용 (엔티티 1개에 여러 상태 OR / match:any에 대비)
  if ((out.condition || out.platform || out.type || 'state') === 'state') {
    // state 값이 to 로만 온 경우 보정
    if (out.state == null && out.to != null) out.state = out.to;

    // state 배열 표준화: 단일/배열/{items}/"on,off" 모두 흡수
    const unwrapped = unwrapItems(out.state);
    if (Array.isArray(unwrapped)) {
      out.state = unwrapped.map(String);
    } else {
      // "on, off" 같은 쉼표 문자열도 배열로 쪼개기
      const maybeSplit = splitMaybeListString(unwrapped);
      out.state = maybeSplit ? maybeSplit : (unwrapped != null ? String(unwrapped) : undefined);
    }
  }

  // numeric_state는 별도 추가 정규화 없음(값은 condition_mapper에서 사용)
  return out;
}

function normalizeConditions(conds) {
  const list = toArray(conds);
  return list.map(normalizeSingleCondition);
}

/* ---------- 자동화 전체 정규화 ---------- */
function normalizeAutomationObject(obj) {
  const o = { ...obj };

  if (o.alias != null && typeof o.alias !== 'string') o.alias = String(o.alias);

  // triggers
  o.triggers = toArray(o.triggers != null ? o.triggers : o.trigger);
  o.triggers = o.triggers.map((t) => {
    const out = { ...t };

    // 공통 보정
    if (out.for != null) out.for = normalizeFor(out.for);
    if (out.target) out.target = normalizeTarget(out.target);

    // 루트 레벨 entity_id도 배열로 표준화 (state/numeric_state 등)
    if (out.entity_id != null) {
      out.entity_id = normalizeEntityList(out.entity_id);
    }

    // sun 트리거 보정: 플랫폼 강제 + offset 정규화
    const plat = out.platform || out.trigger || out.type;
    if (plat === 'sun' || out.event === 'sunrise' || out.event === 'sunset') {
      out.platform = 'sun';
      if (out.offset != null) out.offset = normalizeSunOffset(out.offset); // 0이면 null
    }

    return out;
  });
  delete o.trigger;

    // conditions
    o.conditions = normalizeConditions(o.conditions != null ? o.conditions : o.condition);
    delete o.condition;

  // actions
  o.actions = toArray(o.actions != null ? o.actions : o.action);
  o.actions = o.actions.map(a => {
    const na = { ...a, for: normalizeFor(a?.for), target: normalizeTarget(a?.target) };

    // 루트 레벨 entity_id도 표준화 (target 없이 오는 YAML 대응)
    if (na.entity_id != null) {
      na.entity_id = normalizeEntityList(na.entity_id);
    }

    return na;
  });
  delete o.action;

  return o;
}
