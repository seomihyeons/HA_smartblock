import YAML from 'js-yaml';

const KEY_NORMALIZE = {
    triggers: 'trigger',
    conditions: 'condition',
    actions: 'action',
};

const arrify = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

function normalizeAutomationPayload(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    const out = { ...obj };

    for (const [from, to] of Object.entries(KEY_NORMALIZE)) {
        if (out[from] != null && out[to] == null) {
            out[to] = out[from];
            delete out[from];
        }
    }

    if ('trigger' in out) out.trigger = arrify(out.trigger);
    if ('condition' in out) out.condition = arrify(out.condition);
    if ('action' in out) out.action = arrify(out.action);

    if (!out.mode) out.mode = 'single';

    return out;
}

function parseYamlToSingleAutomation(yamlText) {
    const loaded = YAML.load(yamlText, {
        schema: YAML.SAFE_SCHEMA,
        json: true,
    });

    if (loaded && typeof loaded === 'object') {
        const hasForbiddenKey = (obj) => {
            if (!obj || typeof obj !== 'object') return false;
            if (Array.isArray(obj)) {
                return obj.some(hasForbiddenKey);
            }
            const keys = Object.keys(obj);
            for (const k of keys) {
                if (k === '__proto__' || k === 'constructor' || k === 'prototype') return true;
                if (hasForbiddenKey(obj[k])) return true;
            }
            return false;
        };
        if (hasForbiddenKey(loaded)) {
            throw new Error('Malicious YAML detected: forbidden property names');
        }
    }

    if (Array.isArray(loaded)) {
        if (loaded.length !== 1) {
            throw new Error(`자동화가 ${loaded.length}개로 파싱됨. (지금은 1개만 푸시 지원)`);
        }
        return loaded[0];
    }

    if (loaded && typeof loaded === 'object') return loaded;

    throw new Error('YAML 파싱 결과가 object/list가 아닙니다.');
}

function slugifyIdPart(value, fallback = 'automation') {
    const base = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/['"]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_');
    const clipped = base.slice(0, 48).replace(/^_+|_+$/g, '');
    return clipped || fallback;
}

function genIdFromAlias(alias, prefix = 'sb') {
    const slug = slugifyIdPart(alias, 'automation');
    const suffix = Math.random().toString(36).slice(2, 6);
    return `${prefix}_${slug}_${suffix}`;
}

export async function pushYamlToHomeAssistant(yamlText, { id } = {}) {
    if (!yamlText || !yamlText.trim()) throw new Error('YAML이 비어있습니다.');

    const raw = parseYamlToSingleAutomation(yamlText);
    const payload = normalizeAutomationPayload(raw);

    payload.alias = payload.alias || 'SmartBlock Automation';
    payload.id = payload.id || id || genIdFromAlias(payload.alias);

    const url = `/ha/api/config/automation/config/${encodeURIComponent(payload.id)}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        credentials: 'include',
    });

    const text = await res.text();
    let body = text;
    try { body = text ? JSON.parse(text) : null; } catch { }

    if (!res.ok) {
        throw new Error(`푸시 실패: ${res.status} ${res.statusText}\n${typeof body === 'string' ? body : JSON.stringify(body)}`);
    }

    return {
        id: payload.id,
        alias: payload.alias,
        response: body,
        idWasGenerated: !raw?.id && !id,
    };
}
