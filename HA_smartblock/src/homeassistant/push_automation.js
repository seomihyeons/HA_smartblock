// src/push_automation.js
import YAML from 'js-yaml';

// YAML의 plural 키를 HA 스타일로 맞춤 (네가 쓰는 YAML 포맷에 맞춰 둠)
const KEY_NORMALIZE = {
    triggers: 'trigger',
    conditions: 'condition',
    actions: 'action',
};

// 단일/배열 통일
const arrify = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

function normalizeAutomationPayload(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    const out = { ...obj };

    // triggers/conditions/actions -> trigger/condition/action
    for (const [from, to] of Object.entries(KEY_NORMALIZE)) {
        if (out[from] != null && out[to] == null) {
            out[to] = out[from];
            delete out[from];
        }
    }

    // trigger/condition/action을 배열로 통일
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
        if ('__proto__' in loaded || 'constructor' in loaded || 'prototype' in loaded) {
            throw new Error('Malicious YAML detected: forbidden property names');
        }
    }

    // "- alias: ..." 형태면 리스트로 파싱될 수 있음
    if (Array.isArray(loaded)) {
        if (loaded.length !== 1) {
            throw new Error(`자동화가 ${loaded.length}개로 파싱됨. (지금은 1개만 푸시 지원)`);
        }
        return loaded[0];
    }

    if (loaded && typeof loaded === 'object') return loaded;

    throw new Error('YAML 파싱 결과가 object/list가 아닙니다.');
}

function genId(prefix = 'sb_') {
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 8);
    return `${prefix}${t}${r}`;
}

export async function pushYamlToHomeAssistant(yamlText, { id } = {}) {
    if (!yamlText || !yamlText.trim()) throw new Error('YAML이 비어있습니다.');

    const raw = parseYamlToSingleAutomation(yamlText);
    const payload = normalizeAutomationPayload(raw);

    payload.id = payload.id || id || genId();
    payload.alias = payload.alias || 'SmartBlock Automation';

    // UI(스토리지) 자동화 config 엔드포인트(커뮤니티에서 이 경로를 언급)
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

    return { id: payload.id, alias: payload.alias, response: body };
}
