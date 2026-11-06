import { pullAutomationIndexWithEditability, pullAutomationConfig, setAutomationEnabled } from './pull_automation';
import { renderAutomationToWorkspace } from '../import/yamlToBlocks';
import { normalizeAutomationObject } from '../import/yaml_import';
import { showImportDebugJson } from '../import/import_debug_panel';
import { filterAutomations, isAutomationEnabled } from './automation_search.js';
import { replaceWorkspaceSafely } from '../utils/safe_workspace_replace.js';
import { confirmDiscardUnsavedChanges } from '../utils/unsaved_changes_dialog.js';

const arrify = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

function normalizeHaConfigToInternal(cfg) {
    if (!cfg || typeof cfg !== 'object') throw new Error('Automation config is not an object.');

    const out = { ...cfg };

    if (out.triggers == null && out.trigger != null) out.triggers = out.trigger;
    if (out.conditions == null && out.condition != null) out.conditions = out.condition;
    if (out.actions == null && out.action != null) out.actions = out.action;

    out.triggers = arrify(out.triggers);
    out.conditions = arrify(out.conditions);
    out.actions = arrify(out.actions);

    if (!out.mode) out.mode = 'single';

    return out;
}

function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    children.forEach((c) => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
}

function setStatus(host, msg, isError = false) {
    if (!host) return;
    host.textContent = msg;
    host.style.display = msg ? '' : 'none';
    host.style.color = isError ? '#ef4444' : '#10b981';
}

function fmtTime(iso) {
    if (!iso) return '-';
    try {
        const d = new Date(iso);
        return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
    } catch {
        return String(iso);
    }
}

function summarizeReason(reason) {
    const s = String(reason || '');
    if (s.includes('404')) return 'Config fetch not supported (404) — likely YAML/external-defined';
    return s.slice(0, 120);
}

export function setupHaPullPanel({ ws, outputId = 'generatedCode', workspaceChangeTracker = null } = {}) {
    function ensurePanel() {
        const yamlButtons = document.getElementById('yamlButtons');
        const host = document.getElementById(outputId);

        if (!yamlButtons && !host) return;

        if (document.getElementById('haPullPanel')) return;

        const panel = el('div', { id: 'haPullPanel' });

        panel.style.marginTop = '14px';

        panel.style.padding = '10px';
        panel.style.border = '1px solid #e5e7eb';
        panel.style.borderRadius = '8px';
        panel.style.background = '#fafafa';
        panel.style.maxWidth = '420px'; // 왼쪽 패널 폭에 맞게

        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';
        panel.style.height = '260px';
        panel.style.overflow = 'hidden';
        panel.style.boxSizing = 'border-box';

        const title = el('div', { innerText: 'Home Assistant Automations' });
        title.style.fontWeight = '700';
        title.style.marginBottom = '8px';

        const row = el('div');
        row.style.display = 'flex';
        row.style.gap = '6px';
        row.style.alignItems = 'center';
        row.style.marginBottom = '8px';

        const btnLoad = el('button', { id: 'haLoadListBtn', innerText: 'Load' });
        const btnRefresh = el('button', { id: 'haRefreshBtn', innerText: 'Refresh', disabled: true });
        btnRefresh.style.opacity = '0.6';

        row.appendChild(btnLoad);
        row.appendChild(btnRefresh);

        const searchInput = el('input', {
            id: 'haAutomationSearch', type: 'search', placeholder: 'Search automations...', autocomplete: 'off',
        });
        searchInput.style.display = 'none';
        searchInput.style.width = '100%';
        searchInput.style.boxSizing = 'border-box';
        searchInput.style.marginBottom = '8px';
        searchInput.style.padding = '6px 8px';
        searchInput.style.border = '1px solid #d1d5db';
        searchInput.style.borderRadius = '6px';

        const listBox = el('div', { id: 'haAutomationList' });
        listBox.style.flex = '1 1 auto';
        listBox.style.minHeight = '0';
        listBox.style.overflow = 'auto';
        listBox.style.border = '1px solid #e5e7eb';
        listBox.style.borderRadius = '6px';
        listBox.style.background = '#fff';

        panel.appendChild(title);
        panel.appendChild(row);
        panel.appendChild(searchInput);
        panel.appendChild(listBox);

        // This compact panel intentionally has no status row. Loading and
        // fetch failures remain observable in the browser console instead of
        // consuming vertical space above the automation list.
        const status = null;

        if (yamlButtons) {
            yamlButtons.insertAdjacentElement('afterend', panel);
        } else if (host && host.parentNode) {
            host.parentNode.insertBefore(panel, host.nextSibling);
        }

        let cache = []; // [{ id, name, entity_id, editable, reason?, state, last_triggered, ... }]
        let selectedId = '';

        function renderList() {
            listBox.textContent = '';

            if (!cache.length) {
                const empty = el('div', { innerText: '(no automations)' });
                empty.style.padding = '8px';
                empty.style.color = '#6b7280';
                empty.style.fontSize = '12px';
                listBox.appendChild(empty);
                return;
            }

            const visibleItems = filterAutomations(cache, searchInput.value);
            if (!visibleItems.length) {
                const empty = el('div', { innerText: 'No matching automations' });
                empty.style.padding = '8px';
                empty.style.color = '#6b7280';
                empty.style.fontSize = '12px';
                listBox.appendChild(empty);
                return;
            }

            visibleItems.forEach((item) => {
                const id = item.id;
                const name = item.name || item.entity_id || '(no name)';
                const enabled = isAutomationEnabled(item);

                const rowEl = el('div');
                rowEl.style.padding = '8px 10px';
                rowEl.style.borderBottom = '1px solid #f3f4f6';

                const top = el('div');
                top.style.display = 'flex';
                top.style.alignItems = 'center';
                top.style.justifyContent = 'space-between';
                top.style.gap = '8px';
                top.style.fontWeight = '600';
                top.style.fontSize = '13px';

                const title = el('span', { innerText: name });
                title.style.minWidth = '0';
                title.style.overflow = 'hidden';
                title.style.textOverflow = 'ellipsis';
                title.style.whiteSpace = 'nowrap';

                const stateBadge = el('button', {
                    type: 'button',
                    innerText: enabled ? 'Enabled' : 'Disabled',
                    title: enabled ? 'Disable this Home Assistant automation' : 'Enable this Home Assistant automation',
                });
                stateBadge.setAttribute('aria-label', `${enabled ? 'Disable' : 'Enable'} ${name}`);
                stateBadge.setAttribute('aria-pressed', String(enabled));
                stateBadge.style.flex = '0 0 auto';
                stateBadge.style.padding = '2px 6px';
                stateBadge.style.border = `1px solid ${enabled ? '#86efac' : '#d1d5db'}`;
                stateBadge.style.borderRadius = '999px';
                stateBadge.style.background = enabled ? '#dcfce7' : '#f3f4f6';
                stateBadge.style.color = enabled ? '#166534' : '#6b7280';
                stateBadge.style.fontSize = '10px';
                stateBadge.style.fontWeight = '700';
                stateBadge.style.cursor = 'pointer';
                stateBadge.addEventListener('click', async (event) => {
                    event.stopPropagation();
                    stateBadge.disabled = true;
                    stateBadge.textContent = enabled ? 'Disabling…' : 'Enabling…';
                    try {
                        await setAutomationEnabled(item.entity_id, !enabled);
                        // Re-read HA state instead of trusting an optimistic UI update.
                        await loadList();
                    } catch (error) {
                        console.error(`Failed to ${enabled ? 'disable' : 'enable'} automation`, error);
                        stateBadge.disabled = false;
                        stateBadge.textContent = enabled ? 'Enabled' : 'Disabled';
                    }
                });
                top.appendChild(title);
                top.appendChild(stateBadge);

                const sub = el('div', {
                    innerText: `id: ${id} | HA state: ${item.state || '-'} | last: ${fmtTime(item.last_triggered)}`,
                });
                sub.style.fontSize = '11px';
                sub.style.color = '#6b7280';

                rowEl.appendChild(top);
                rowEl.appendChild(sub);

                if (!enabled) {
                    rowEl.style.background = '#fafafa';
                    title.style.color = '#6b7280';

                    const inactiveNote = el('div', {
                        innerText: 'Disabled in Home Assistant. You can still import it; importing does not enable it.',
                    });
                    inactiveNote.style.marginTop = '3px';
                    inactiveNote.style.color = '#6b7280';
                    inactiveNote.style.fontSize = '11px';
                    rowEl.appendChild(inactiveNote);
                }

                if (id && id === selectedId) rowEl.style.background = '#eef2ff';

                if (!item.editable) {
                    rowEl.style.opacity = '0.55';
                    rowEl.style.cursor = 'not-allowed';

                    const why = el('div', { innerText: summarizeReason(item.reason) });
                    why.style.fontSize = '11px';
                    why.style.color = '#9ca3af';
                    why.style.marginTop = '3px';
                    rowEl.appendChild(why);
                } else {
                    rowEl.style.cursor = 'pointer';

                    rowEl.addEventListener('click', async () => {
                        if (!id) return;
                        if (ws && !await workspaceChangeTracker?.confirmBeforeReplace?.(() =>
                            confirmDiscardUnsavedChanges({
                                loadingDescription: `Loading “${name}” will replace your current blocks.`,
                            })
                        )) return;
                        selectedId = id;
                        renderList();

                        try {
                            setStatus(status, 'Fetching automation config...');

                            const cfg = await pullAutomationConfig(id);
                            const internal = normalizeAutomationObject(cfg);

                            if (!internal.alias) internal.alias = item.name || item.entity_id || 'Automation';
                            if (!internal.id) internal.id = id;

                            if (!ws) {
                                console.log('[PULL CONFIG]', internal);
                                setStatus(status, `Loaded (console): ${internal.alias || internal.id}`);
                                return;
                            }

                            showImportDebugJson(internal);
                            replaceWorkspaceSafely(ws, () => {
                                renderAutomationToWorkspace(ws, internal, { clearBefore: true });
                            });
                            workspaceChangeTracker?.markClean?.();

                            setStatus(status, `Loaded: ${internal.alias || internal.id}`);
                        } catch (e) {
                            console.error(e);
                            setStatus(status, String(e?.message || e), true);
                        }
                    });
                }

                listBox.appendChild(rowEl);
            });
        }

        async function loadList() {
            try {
                setStatus(status, 'Loading automations...');

                const { all } = await pullAutomationIndexWithEditability({ concurrency: 3 });

                cache = Array.isArray(all) ? all : [];

                cache.sort((a, b) => {
                    if (a.editable !== b.editable) return Number(b.editable) - Number(a.editable);
                    return String(a.name || '').localeCompare(String(b.name || ''), 'en');
                });

                btnRefresh.disabled = false;
                btnRefresh.style.opacity = '1';
                searchInput.style.display = '';

                // The list itself communicates availability; reserve this area
                // for transient loading and actionable error messages only.
                setStatus(status, '');
                renderList();
            } catch (e) {
                console.error(e);
                setStatus(status, String(e?.message || e), true);
            }
        }

        btnLoad.addEventListener('click', loadList);
        btnRefresh.addEventListener('click', loadList);
        searchInput.addEventListener('input', renderList);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensurePanel);
    } else {
        ensurePanel();
    }
}
