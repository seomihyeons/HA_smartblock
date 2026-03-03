function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function normalizeEntityList(v) {
  const arr = asArray(v)
    .flatMap((x) => (Array.isArray(x) ? x : [x]))
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  return [...new Set(arr)].sort();
}

function normalizeFor(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const d = Number(v.days || 0);
    const h = Number(v.hours || 0);
    const m = Number(v.minutes || 0);
    const s = Number(v.seconds || 0);
    const total = Math.max(0, Math.floor(d * 86400 + h * 3600 + m * 60 + s));
    const hh = (total / 3600) | 0;
    const mm = ((total % 3600) / 60) | 0;
    const ss = total % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }
  return String(v);
}

function normalizeSignedHms(v) {
  if (v == null) return null;
  const s = String(v).trim();
  const m = s.match(/^([+-])?(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return s;
  const sign = m[1] === '-' ? '-' : '+';
  let h = Number(m[2]);
  let mm = Number(m[3]);
  let ss = Number(m[4]);

  h += Math.floor(mm / 60);
  mm = mm % 60;
  mm += Math.floor(ss / 60);
  ss = ss % 60;
  h += Math.floor(mm / 60);
  mm = mm % 60;

  const out = `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return sign === '-' ? `-${out}` : out;
}

function normalizeHms(v) {
  if (v == null) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const hh = String(Number(m[1])).padStart(2, '0');
    return `${hh}:${m[2]}:00`;
  }
  m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (m) {
    const hh = String(Number(m[1])).padStart(2, '0');
    return `${hh}:${m[2]}:${m[3]}`;
  }
  return s;
}

function normalizeWeekdayList(v) {
  const map = {
    monday: 'mon',
    tuesday: 'tue',
    wednesday: 'wed',
    thursday: 'thu',
    friday: 'fri',
    saturday: 'sat',
    sunday: 'sun',
  };
  const arr = asArray(v)
    .map((x) => String(x || '').trim().toLowerCase())
    .filter(Boolean)
    .map((x) => map[x] || x);
  return [...new Set(arr)].sort();
}

function stable(obj) {
  if (Array.isArray(obj)) return obj.map(stable);
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  Object.keys(obj).sort().forEach((k) => {
    out[k] = stable(obj[k]);
  });
  return out;
}

function fp(x) {
  return JSON.stringify(stable(x));
}

function normalizeTriggerOne(t) {
  const type = String(t?.trigger || t?.platform || '').trim();
  const one = { type };
  if (t?.from != null) one.from = String(t.from);
  if (t?.to != null) one.to = String(t.to);
  if (t?.event != null) one.event = String(t.event);
  if (t?.offset != null) one.offset = normalizeSignedHms(t.offset);
  if (t?.above != null) one.above = Number(t.above);
  if (t?.below != null) one.below = Number(t.below);
  const f = normalizeFor(t?.for);
  if (f) one.for = f;
  const eids = normalizeEntityList(t?.entity_id ?? t?.entity);
  if (eids.length) one.entity_id = eids[0];
  return one;
}

function normalizeTriggers(list) {
  const expanded = [];
  asArray(list).forEach((t) => {
    const eids = normalizeEntityList(t?.entity_id ?? t?.entity);
    if (!eids.length) {
      expanded.push(normalizeTriggerOne(t));
      return;
    }
    eids.forEach((eid) => {
      expanded.push(normalizeTriggerOne({ ...t, entity_id: [eid] }));
    });
  });
  return expanded.sort((a, b) => fp(a).localeCompare(fp(b)));
}

function normalizeConditionOne(c) {
  if (!c || typeof c !== 'object') return c;

  if (Array.isArray(c.or) || c.condition === 'or') {
    const raw = Array.isArray(c.or) ? c.or : asArray(c.conditions);
    return { or: raw.map(normalizeConditionOne).sort((a, b) => fp(a).localeCompare(fp(b))) };
  }
  if (Array.isArray(c.and) || c.condition === 'and') {
    const raw = Array.isArray(c.and) ? c.and : asArray(c.conditions);
    return { and: normalizeConditionsForAnd(raw) };
  }
  if (Array.isArray(c.not) || c.condition === 'not') {
    const raw = Array.isArray(c.not) ? c.not : asArray(c.conditions);
    return { not: raw.map(normalizeConditionOne).sort((a, b) => fp(a).localeCompare(fp(b))) };
  }

  const type = String(c.condition || '').trim();
  const out = { condition: type };
  const eids = normalizeEntityList(c.entity_id ?? c.entity);
  if (eids.length) out.entity_id = eids[0];
  if (c.state != null) out.state = String(c.state);
  if (c.after != null) out.after = normalizeHms(c.after);
  if (c.before != null) out.before = normalizeHms(c.before);
  if (c.after_offset != null) out.after_offset = normalizeSignedHms(c.after_offset);
  if (c.before_offset != null) out.before_offset = normalizeSignedHms(c.before_offset);
  if (c.weekday != null) {
    const weekday = normalizeWeekdayList(c.weekday);
    if (weekday.length) out.weekday = weekday;
  }
  if (c.attribute != null) out.attribute = String(c.attribute);
  if (c.above != null) out.above = Number(c.above);
  if (c.below != null) out.below = Number(c.below);
  return out;
}

function canonicalizeAndTimeConditions(items) {
  const out = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || item.condition !== 'time') {
      out.push(item);
      continue;
    }

    const keys = Object.keys(item);
    const allowed = new Set(['condition', 'after', 'before', 'weekday']);
    const isSimpleTime = keys.every((k) => allowed.has(k));
    const hasRange = item.after != null || item.before != null;
    const hasWeekday = Array.isArray(item.weekday) && item.weekday.length > 0;

    if (isSimpleTime && hasRange && hasWeekday) {
      const rangePart = { condition: 'time' };
      if (item.after != null) rangePart.after = item.after;
      if (item.before != null) rangePart.before = item.before;
      out.push(rangePart);
      out.push({ condition: 'time', weekday: item.weekday });
      continue;
    }

    out.push(item);
  }
  return out;
}

function normalizeConditionsForAnd(list) {
  const normalized = asArray(list).map(normalizeConditionOne);
  const canonical = canonicalizeAndTimeConditions(normalized);
  return canonical.sort((a, b) => fp(a).localeCompare(fp(b)));
}

function normalizeConditions(list) {
  return normalizeConditionsForAnd(list);
}

function stripEntityIdFromData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const { entity_id, ...rest } = data;
  return rest;
}

function normalizeRgbColorValue(v) {
  const toTriplet = (arr) => {
    if (!Array.isArray(arr) || arr.length < 3) return null;
    const nums = arr.slice(0, 3).map((x) => Number(x));
    if (!nums.every((n) => Number.isFinite(n))) return null;
    return nums;
  };

  const fromArray = toTriplet(v);
  if (fromArray) return fromArray;

  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!s) return v;

  const bracket = s.match(/^\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]$/);
  if (bracket) {
    return [Number(bracket[1]), Number(bracket[2]), Number(bracket[3])];
  }

  const csv = s.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (csv) {
    return [Number(csv[1]), Number(csv[2]), Number(csv[3])];
  }

  return v;
}

function normalizeHsColorValue(v) {
  const toPair = (arr) => {
    if (!Array.isArray(arr) || arr.length < 2) return null;
    const first = arr[0];
    const secondNum = Number(arr[1]);
    const second = Number.isFinite(secondNum) ? secondNum : arr[1];
    return [first, second];
  };

  const fromArray = toPair(v);
  if (fromArray) return fromArray;

  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!s) return v;

  const tryJson = (x) => {
    try {
      const parsed = JSON.parse(x);
      const p = toPair(parsed);
      if (p) return p;
    } catch (_) {}
    return null;
  };

  let parsed = tryJson(s);
  if (parsed) return parsed;

  const unquote = (x) => {
    if ((x.startsWith('"') && x.endsWith('"')) || (x.startsWith("'") && x.endsWith("'"))) {
      return x.slice(1, -1);
    }
    return x;
  };
  const stripped = unquote(s);
  parsed = tryJson(stripped);
  if (parsed) return parsed;

  if (stripped.startsWith('[') && stripped.endsWith(']')) {
    const inner = stripped.slice(1, -1);
    const parts = [];
    let cur = '';
    let quote = '';
    let esc = false;
    let depthParen = 0;
    for (let i = 0; i < inner.length; i += 1) {
      const ch = inner[i];
      if (esc) {
        cur += ch;
        esc = false;
        continue;
      }
      if (ch === '\\') {
        cur += ch;
        esc = true;
        continue;
      }
      if (quote) {
        cur += ch;
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        cur += ch;
        continue;
      }
      if (ch === '(') depthParen += 1;
      else if (ch === ')' && depthParen > 0) depthParen -= 1;
      if (ch === ',' && depthParen === 0) {
        parts.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    if (parts.length >= 2) {
      const a = unquote(parts[0]);
      const bRaw = unquote(parts[1]);
      const bNum = Number(bRaw);
      return [a, Number.isFinite(bNum) ? bNum : bRaw];
    }
  }

  return v;
}

function normalizeMediaContentIdValue(v) {
  if (typeof v !== 'string') return v;
  let s = v.replace(/\r\n/g, '\n').trim();
  if (!s) return s;
  if (s.startsWith('>')) {
    s = s.slice(1).trim();
  }
  if (s.startsWith("'media-source://") || s.startsWith('"media-source://')) {
    s = s.slice(1).trim();
  }
  s = s.replace(/\n+\s*['"]$/, '');
  // import/generate 경로에 따라 이스케이프 깊이가 달라질 수 있어 반복 평탄화
  for (let i = 0; i < 3; i += 1) {
    const prev = s;
    s = s
      .replace(/\\\\\"/g, '\\"')
      .replace(/\\"/g, '"')
      .replace(/\\\\n/g, '\\n');
    if (s === prev) break;
  }
  s = s.replace(/\\n/g, ' ');
  s = s.replace(/\s*\n\s*/g, ' ');
  s = s.replace(/\s{2,}/g, ' ');
  return s.trim();
}

function normalizeMediaSourceValue(v) {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!s) return s;
  if (s.startsWith('media-source://')) return s;
  if (s.startsWith('//')) return `media-source:${s}`;
  return s;
}

function normalizePayloadTemplate(v) {
  if (typeof v !== 'string') return v;
  let s = v.replace(/\r\n/g, '\n').trim();
  if (!s) return s;

  // 역슬래시 이스케이프가 중첩된 경우(예: \\\" , \\n)를 먼저 평탄화한다.
  // import/generate 경로에 따라 escape depth가 달라질 수 있어 2~3회 반복한다.
  for (let i = 0; i < 3; i += 1) {
    const prev = s;
    s = s
      .replace(/\\\\n/g, '\\n')
      .replace(/\\\\r/g, '\\r')
      .replace(/\\\\\"/g, '\\"');
    if (s === prev) break;
  }

  // YAML/JSON 표현 차이 정규화:
  // - 줄바꿈/탭/다중 공백 축약
  // - doubled single quote('') -> single quote(')
  // - escaped newline/quote 표현 차이 흡수
  s = s.replace(/\t/g, ' ');
  s = s.replace(/\\r/g, ' ');
  s = s.replace(/\\n/g, ' ');
  s = s.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  s = s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  s = s.replace(/\\"/g, '"');
  s = s.replace(/"\s*\\\s*:/g, '":');
  s = s.replace(/\s*\n\s*/g, ' ');
  s = s.replace(/\s{2,}/g, ' ');
  s = s.replace(/''/g, "'");

  return s.trim();
}

function normalizeDataPayload(v) {
  if (Array.isArray(v)) return v.map(normalizeDataPayload);
  if (!v || typeof v !== 'object') return v;

  const src = { ...v };
  const out = {};

  if (
    Object.prototype.hasOwnProperty.call(src, 'media_content_id') &&
    String(src.media_content_id).trim() === '>' &&
    Object.prototype.hasOwnProperty.call(src, 'media-source')
  ) {
    const merged = normalizeMediaSourceValue(src['media-source']);
    if (typeof merged === 'string' && merged.trim()) {
      src.media_content_id = merged;
    }
    delete src['media-source'];
  }

  for (const [k, val] of Object.entries(src)) {
    if (k === 'entity_id') {
      const ids = normalizeEntityList(val);
      out[k] = ids;
      continue;
    }
    if (k === 'media_content_id') {
      out[k] = normalizeMediaContentIdValue(val);
      continue;
    }
    if (k === 'payload') {
      out[k] = normalizePayloadTemplate(val);
      continue;
    }
    if (k === 'rgb_color') {
      out[k] = normalizeRgbColorValue(val);
      continue;
    }
    if (k === 'hs_color') {
      out[k] = normalizeHsColorValue(val);
      continue;
    }
    out[k] = normalizeDataPayload(val);
  }
  return out;
}

function getActionDelaySource(a) {
  if (!a || typeof a !== 'object') return null;

  const siblingDelay = (
    a.days != null || a.hours != null || a.minutes != null || a.seconds != null
  )
    ? { days: a.days, hours: a.hours, minutes: a.minutes, seconds: a.seconds }
    : null;

  if (a.delay != null) {
    if (
      a.delay &&
      typeof a.delay === 'object' &&
      !Array.isArray(a.delay) &&
      Object.keys(a.delay).length === 0 &&
      siblingDelay
    ) {
      return siblingDelay;
    }
    return a.delay;
  }

  return siblingDelay;
}

function normalizeActionOne(a) {
  const delaySource = getActionDelaySource(a);
  if (delaySource != null) {
    const d = normalizeFor(delaySource);
    return { delay: d || String(delaySource) };
  }

  const service = String(a?.action || a?.service || '').trim();
  const targetIds = normalizeEntityList(
    a?.target?.entity_id ?? a?.data?.entity_id ?? a?.entity_id
  );
  const data = normalizeDataPayload(stripEntityIdFromData(a?.data));
  const out = { action: service };
  if (targetIds.length) out.entity_id = targetIds;
  if (Object.keys(data).length) out.data = stable(data);
  return out;
}

function normalizeActions(list) {
  return asArray(list).map(normalizeActionOne);
}

function sectionCounts(obj) {
  return {
    triggers: asArray(obj?.triggers ?? obj?.trigger).length,
    conditions: asArray(obj?.conditions ?? obj?.condition).length,
    actions: asArray(obj?.actions ?? obj?.action).length,
  };
}

export function compareSemantic(original, regenerated) {
  const strictOriginal = stable(original || {});
  const strictRegenerated = stable(regenerated || {});
  const strictEqual = fp(strictOriginal) === fp(strictRegenerated);

  const normOriginal = {
    triggers: normalizeTriggers(original?.triggers ?? original?.trigger),
    conditions: normalizeConditions(original?.conditions ?? original?.condition),
    actions: normalizeActions(original?.actions ?? original?.action),
  };
  const normRegenerated = {
    triggers: normalizeTriggers(regenerated?.triggers ?? regenerated?.trigger),
    conditions: normalizeConditions(regenerated?.conditions ?? regenerated?.condition),
    actions: normalizeActions(regenerated?.actions ?? regenerated?.action),
  };

  const semanticEqual = fp(normOriginal) === fp(normRegenerated);
  return {
    semanticEqual,
    strictEqual,
    counts: {
      original: sectionCounts(original || {}),
      regenerated: sectionCounts(regenerated || {}),
    },
    normalized: {
      original: normOriginal,
      regenerated: normRegenerated,
    },
  };
}
