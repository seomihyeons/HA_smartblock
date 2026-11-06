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

async function haServiceCall(domain, service, payload) {
    const res = await fetch(`${API_BASE}/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload || {}),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HA service ${domain}.${service} failed: ${res.status} ${text}`);
    }
    return res.json().catch(() => null);
}

/**
 * Toggle a live Home Assistant automation without changing its YAML config.
 * The caller must pass the HA entity_id (automation.<slug>), not the config id.
 */
export async function setAutomationEnabled(entityId, enabled) {
    const target = String(entityId || '').trim();
    if (!target.startsWith('automation.')) throw new Error('Missing Home Assistant automation entity ID');
    return haServiceCall('automation', enabled ? 'turn_on' : 'turn_off', { entity_id: target });
}

export async function pullAutomationIndex() {
    const states = await haFetch('/states');

    return states
        .filter((s) => String(s.entity_id || '').startsWith('automation.'))
        .map((s) => ({
            entity_id: s.entity_id,
            id: s.attributes?.id,
            name: s.attributes?.friendly_name || s.entity_id,
            state: s.state,
            last_triggered: s.attributes?.last_triggered || null,
        }))
        .filter((x) => x.id);
}

export async function pullAutomationConfig(id) {
    if (!id) throw new Error('Missing automation id');
    return haFetch(`/config/automation/config/${encodeURIComponent(String(id))}`);
}

export async function pullAutomationIndexWithEditability({
    concurrency = 3,
    includeConfig = true,
} = {}) {
    const index = await pullAutomationIndex();

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
            const cfg = await pullAutomationConfig(meta.id);
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

    const all = checked.map((x) => ({
        ...x.meta,
        editable: x.editable,
        reason: x.reason,
    }));

    all.sort((a, b) => Number(b.editable) - Number(a.editable));

    return { editable, nonEditable, all };
}
