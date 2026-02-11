// src/homeassistant/pull_automation.js

const API_BASE = '/ha/api';

async function haFetch(path) {
    const res = await fetch(`${API_BASE}${path}`, {
        credentials: 'include',
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HA GET ${path} failed: ${res.status} ${text}`);
    }
    return res.json();
}

// 1) automation 엔티티 목록 (states 기반)
export async function pullAutomationIndex() {
    const states = await haFetch('/states');

    return states
        .filter((s) => String(s.entity_id || '').startsWith('automation.'))
        .map((s) => ({
            entity_id: s.entity_id,
            id: s.attributes?.id, // ← config 조회/업데이트에 쓰는 id
            name: s.attributes?.friendly_name || s.entity_id,
            state: s.state,
            last_triggered: s.attributes?.last_triggered || null,
        }))
        .filter((x) => x.id);
}

// 2) automation config 단건 (id로)
export async function pullAutomationConfig(id) {
    if (!id) throw new Error('Missing automation id');
    return haFetch(`/config/automation/config/${encodeURIComponent(String(id))}`);
}

/**
 * ✅ 3) "편집 가능 여부"를 판별해서 목록 리턴
 *
 * return:
 *  {
 *    editable: [ { meta, config } ... ],      // config pull 성공한 것들
 *    nonEditable: [ { meta, reason } ... ],   // 실패한 것들 (대개 404)
 *    all: [ { ...meta, editable, reason? } ]  // UI용 통합 리스트
 *  }
 *
 * - concurrency: 동시에 config pull 할 개수(기본 3)
 * - includeConfig: true면 editable 리스트에 config까지 포함(기본 true)
 */
export async function pullAutomationIndexWithEditability({
    concurrency = 3,
    includeConfig = true,
} = {}) {
    const index = await pullAutomationIndex();

    // 동시 실행 제한
    async function mapLimit(items, limit, mapper) {
        const results = new Array(items.length);
        let i = 0;

        const workers = Array.from({ length: Math.max(1, limit) }, async () => {
            while (true) {
                const cur = i++;
                if (cur >= items.length) break;
                results[cur] = await mapper(items[cur], cur);
            }
        });

        await Promise.all(workers);
        return results;
    }

    const checked = await mapLimit(index, concurrency, async (meta) => {
        try {
            const cfg = await pullAutomationConfig(meta.id); // ← 항상 시도
            return {
                meta,
                editable: true,
                config: includeConfig ? cfg : undefined,
            };
        } catch (e) {
            return {
                meta,
                editable: false,
                reason: String(e?.message || e),
            };
        }
    });


    const editable = checked
        .filter((x) => x.editable)
        .map((x) => ({ meta: x.meta, config: x.config }));

    const nonEditable = checked
        .filter((x) => !x.editable)
        .map((x) => ({ meta: x.meta, reason: x.reason }));

    // UI에서 바로 쓰기 좋은 통합 리스트(정렬도 여기서 가능)
    const all = checked.map((x) => ({
        ...x.meta,
        editable: x.editable,
        reason: x.reason,
    }));

    // (선택) UI 표시 우선순위: editable 먼저
    all.sort((a, b) => Number(b.editable) - Number(a.editable));

    return { editable, nonEditable, all };
}
