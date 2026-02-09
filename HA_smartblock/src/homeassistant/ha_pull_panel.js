// src/homeassistant/ha_pull_panel.js
import { pullAutomationIndexWithEditability, pullAutomationConfig } from './pull_automation';
import { renderAutomationToWorkspace } from '../import/yamlToBlocks';
import { normalizeAutomationObject } from '../import/yaml_import';

// 단일/배열 통일
const arrify = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// HA config(JSON)을 SmartBlock internal 포맷으로 맞춤
// - trigger/condition/action -> triggers/conditions/actions
function normalizeHaConfigToInternal(cfg) {
    if (!cfg || typeof cfg !== 'object') throw new Error('Automation config is not an object.');

    const out = { ...cfg };

    // HA: trigger/condition/action or triggers/conditions/actions
    if (out.triggers == null && out.trigger != null) out.triggers = out.trigger;
    if (out.conditions == null && out.condition != null) out.conditions = out.condition;
    if (out.actions == null && out.action != null) out.actions = out.action;

    out.triggers = arrify(out.triggers);
    out.conditions = arrify(out.conditions);
    out.actions = arrify(out.actions);

    // mode 기본값
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
    host.textContent = msg;
    host.style.color = isError ? '#ef4444' : '#10b981';
}

// 간단한 시간 포맷 (마지막 트리거 표시용)
function fmtTime(iso) {
    if (!iso) return '-';
    try {
        const d = new Date(iso);
        return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
    } catch {
        return String(iso);
    }
}

// "YAML/외부 정의" 같은 경우 404 메시지에서 사람이 보기 좋게 요약
function summarizeReason(reason) {
    const s = String(reason || '');
    if (s.includes('404')) return 'Config fetch not supported (404) — likely YAML/external-defined';
    return s.slice(0, 120);
}

export function setupHaPullPanel({ ws, outputId = 'generatedCode' } = {}) {
    function ensurePanel() {
        // 패널을 붙일 기준점: yamlButtons(왼쪽 버튼 묶음)
        const yamlButtons = document.getElementById('yamlButtons');
        const host = document.getElementById(outputId);

        // 버튼 영역도 없고 host도 없으면 지금 화면 구조를 못 잡은 것
        if (!yamlButtons && !host) return;

        // 중복 생성 방지
        if (document.getElementById('haPullPanel')) return;

        const panel = el('div', { id: 'haPullPanel' });

        // ✅ 버튼과 패널 사이 간격 조금 더 (원하면 12~16으로 조절)
        panel.style.marginTop = '14px';

        panel.style.padding = '10px';
        panel.style.border = '1px solid #e5e7eb';
        panel.style.borderRadius = '8px';
        panel.style.background = '#fafafa';
        panel.style.maxWidth = '420px'; // 왼쪽 패널 폭에 맞게


        // ✅ 추가 (핵심)
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';
        panel.style.height = '260px';        // <- 여기만 취향대로(170~230 추천)
        panel.style.overflow = 'hidden';
        panel.style.boxSizing = 'border-box';

        // ✅ 타이틀은 그대로 유지
        const title = el('div', { innerText: 'HA Automations (Pull)' });
        title.style.fontWeight = '700';
        title.style.marginBottom = '8px';

        const row = el('div');
        row.style.display = 'flex';
        row.style.gap = '6px';
        row.style.alignItems = 'center';
        row.style.marginBottom = '8px';

        const btnLoad = el('button', { id: 'haLoadListBtn', innerText: 'Load list' });
        const btnRefresh = el('button', { id: 'haRefreshBtn', innerText: 'Refresh', disabled: true });
        btnRefresh.style.opacity = '0.6';

        row.appendChild(btnLoad);
        row.appendChild(btnRefresh);

        const status = el('div', { id: 'haPullStatus', innerText: '' });
        status.style.fontSize = '12px';
        status.style.marginBottom = '8px';
        status.style.minHeight = '16px';

        const listBox = el('div', { id: 'haAutomationList' });
        //listBox.style.flex = '1';
        //listBox.style.minHeight = '0';     // flex 컨테이너에서 scroll 동작 필수
        listBox.style.overflow = 'auto';
        listBox.style.border = '1px solid #e5e7eb';
        listBox.style.borderRadius = '6px';
        listBox.style.background = '#fff';

        panel.appendChild(title);
        panel.appendChild(row);
        panel.appendChild(status);
        panel.appendChild(listBox);

        // ✅ "왼쪽 하단": yamlButtons 바로 아래에 붙이기
        if (yamlButtons) {
            yamlButtons.insertAdjacentElement('afterend', panel);
        } else if (host && host.parentNode) {
            host.parentNode.insertBefore(panel, host.nextSibling);
        }

        let cache = []; // [{ id, name, entity_id, editable, reason?, state, last_triggered, ... }]
        let selectedId = '';

        function renderList() {
            listBox.innerHTML = '';

            if (!cache.length) {
                const empty = el('div', { innerText: '(no automations)' });
                empty.style.padding = '8px';
                empty.style.color = '#6b7280';
                empty.style.fontSize = '12px';
                listBox.appendChild(empty);
                return;
            }

            cache.forEach((item) => {
                const id = item.id;
                const name = item.name || item.entity_id || '(no name)';

                const rowEl = el('div');
                rowEl.style.padding = '8px 10px';
                rowEl.style.borderBottom = '1px solid #f3f4f6';

                const top = el('div', {
                    innerText: `${item.editable ? '' : '⚠️'} ${name}`,
                });

                top.style.fontWeight = '600';

                // ✅ 제목 폰트가 너무 크다 → 줄이기 (12~13 추천)
                top.style.fontSize = '13px';

                const sub = el('div', {
                    innerText: `id: ${id} | state: ${item.state || '-'} | last: ${fmtTime(item.last_triggered)}`,
                });
                sub.style.fontSize = '11px';
                sub.style.color = '#6b7280';

                rowEl.appendChild(top);
                rowEl.appendChild(sub);

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
                        selectedId = id;
                        renderList();

                        try {
                            // ✅ 한국어 → 영어
                            setStatus(status, 'Fetching automation config...');

                            const cfg = await pullAutomationConfig(id);
                            const internal = normalizeAutomationObject(cfg);

                            if (!internal.alias) internal.alias = item.name || item.entity_id || 'Automation';
                            if (!internal.id) internal.id = id;

                            if (!ws) {
                                console.log('[PULL CONFIG]', internal);

                                // ✅ 한국어 → 영어
                                setStatus(status, `Loaded (console): ${internal.alias || internal.id}`);
                                return;
                            }

                            renderAutomationToWorkspace(ws, internal, { clearBefore: true });

                            // ✅ 한국어 → 영어
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
                // ✅ 한국어 → 영어
                setStatus(status, 'Loading automations...');

                // ✅ 여기서 editable 판별까지 같이 수행
                // (concurrency는 HA 부담 줄이기 위해 2~3 추천)
                const { all } = await pullAutomationIndexWithEditability({ concurrency: 3 });

                cache = Array.isArray(all) ? all : [];

                // 정렬: editable 먼저, 그 다음 이름
                cache.sort((a, b) => {
                    if (a.editable !== b.editable) return Number(b.editable) - Number(a.editable);
                    return String(a.name || '').localeCompare(String(b.name || ''), 'en');
                });

                const okCount = cache.filter((x) => x.editable).length;

                btnRefresh.disabled = false;
                btnRefresh.style.opacity = '1';

                // ✅ 한국어 → 영어 (좀 더 “UI용” 문장)
                setStatus(status, `Loaded ${cache.length}. Editable: ${okCount}. Click ✅ items to open.`);
                renderList();
            } catch (e) {
                console.error(e);
                setStatus(status, String(e?.message || e), true);
            }
        }

        btnLoad.addEventListener('click', loadList);
        btnRefresh.addEventListener('click', loadList);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensurePanel);
    } else {
        ensurePanel();
    }
}
