import { runConflictAnalyzer } from "./run_conflict_analyzer";
import { setModalOpenState } from "../../utils/floating_modal_state";
import { buildConflictSummary, classifyConflictError } from "./conflict_report_format.js";

function $(id) { return document.getElementById(id); }
function setText(el, text) { if (el) el.textContent = text; }

function createNode(tag, className, text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

function renderIssueCards(host, report) {
    if (!host) return;
    host.innerHTML = "";

    const issues = Array.isArray(report?.inconsistency) ? report.inconsistency : [];
    const incCount = report?.summary?.inconsistency_issues ?? issues.length ?? 0;
    if (!issues.length && incCount === 0) {
        return;
    }

    const summary = createNode("div", "debug-issue-summary", `Detected ${incCount} inconsistency issue(s)`);
    host.appendChild(summary);

    if (!issues.length) {
        host.appendChild(createNode("div", "debug-issue-empty", "No detailed issue list provided by analyzer."));
        return;
    }

    const list = createNode("div", "debug-issue-list");
    issues.forEach((iss, index) => {
        const card = createNode("section", "debug-issue-card");

        const head = createNode("div", "debug-issue-head");
        head.appendChild(createNode("div", "debug-issue-title", `Issue ${index + 1}`));
        head.appendChild(createNode("span", "debug-issue-badge", String(iss?.issue || "Issue")));
        card.appendChild(head);

        const body = createNode("div", "debug-issue-body");
        const rows = [
            ["Trigger", iss?.event],
            ["Action 1", iss?.action1],
            ["Action 2", iss?.action2],
            ["Entity", iss?.entity],
        ];

        rows.forEach(([label, value]) => {
            if (value == null || String(value).trim() === "") return;
            const row = createNode("div", "debug-issue-row");
            row.appendChild(createNode("div", "debug-issue-key", label));
            row.appendChild(createNode("code", "debug-issue-value", String(value)));
            body.appendChild(row);
        });

        card.appendChild(body);
        list.appendChild(card);
    });
    host.appendChild(list);

    host.appendChild(
        createNode(
            "div",
            "debug-issue-note",
            "Two rules triggered by the same event produce conflicting actions."
        )
    );
}

export function initConflictAnalyzerUI() {
    const btnDebug = $("btnDebug");
    const modal = $("debugModal");
    const backdrop = $("debugModalBackdrop");
    const btnClose = $("debugModalClose");
    const btnRun = $("debugRun");
    const btnCopy = $("debugCopy");
    const out = $("debugOutput");
    const statusEl = $("debugStatus");
    const summaryEl = $("debugSummary");
    const errorEl = $("debugError");
    const spinnerEl = $("debugSpinner");

    if (!btnDebug || !modal || !btnRun || !btnCopy || !out) return;

    const open = () => {
        modal.classList.remove("hidden");
        setModalOpenState("debugModal", true);
    };
    const close = () => {
        modal.classList.add("hidden");
        setModalOpenState("debugModal", false);
    };

    const copy = async () => {
        const text = out.textContent || "";
        await navigator.clipboard.writeText(text);
    };

    const setStatus = (state, text) => {
        if (!statusEl) return;
        statusEl.className = `debug-status state-${state}`;
        statusEl.textContent = text || state;
    };

    const setSummary = (text) => {
        if (!summaryEl) return;
        summaryEl.classList.remove("hidden");
        summaryEl.textContent = text || "Automations analyzed: -\nEvents: -\nActions: -\nRule edges: -\nInconsistency issues: -\nConflict types: -\nConflicting entities: -\nElapsed: -";
    };

    const setError = (text) => {
        if (!errorEl) return;
        if (!text) {
            errorEl.classList.add("hidden");
            errorEl.textContent = "";
            return;
        }
        errorEl.classList.remove("hidden");
        errorEl.textContent = text;
    };

    const toggleSpinner = (on) => {
        if (!spinnerEl) return;
        spinnerEl.classList.toggle("hidden", !on);
    };

    let pendingDraft = null;
    const run = async () => {
        setText(out, "");
        setSummary("Automations analyzed: -\nEvents: -\nActions: -\nRule edges: -\nInconsistency issues: -\nConflict types: -\nConflicting entities: -\nElapsed: running...");
        setError("");
        setStatus("running", "Analyzing...");
        toggleSpinner(true);
        btnRun.disabled = true;

        const startedAt = performance.now();
        try {
            const report = await runConflictAnalyzer({ onlyEnabled: true, concurrency: 8, ...(pendingDraft || {}) });
            const ms = Math.round(performance.now() - startedAt);
            setSummary(buildConflictSummary(report, ms));
            renderIssueCards(out, report);
            setStatus("done", "Analysis Complete");
        } catch (e) {
            const msg = classifyConflictError(e);
            setText(out, String(e?.message || e));
            setError(msg);
            const ms = Math.round(performance.now() - startedAt);
            setSummary(buildConflictSummary(null, ms));
            setStatus("error", "Error");
        } finally {
            toggleSpinner(false);
            btnRun.disabled = false;
        }
    };

    btnDebug.addEventListener("click", () => { pendingDraft = null; open(); });
    document.addEventListener('open-conflict-analyzer', (event) => {
        const detail = event?.detail || {};
        pendingDraft = String(detail.draftYaml || '').trim() ? {
            draftYaml: String(detail.draftYaml),
            automationId: detail.automationId || null,
        } : null;
        open();
        if (detail.source === 'ai-assistant' && !pendingDraft) {
            setStatus('error', 'Draft unavailable');
            setError('The current Blockly automation could not be exported. Conflict analysis was not started.');
            return;
        }
        if (detail.autoRun === true && !btnRun.disabled) void run();
    });
    backdrop?.addEventListener("click", close);
    btnClose?.addEventListener("click", close);
    btnCopy.addEventListener("click", copy);
    btnRun.addEventListener("click", run);

    setStatus("idle", "Ready");
    setSummary("Automations analyzed: -\nEvents: -\nActions: -\nRule edges: -\nInconsistency issues: -\nConflict types: -\nConflicting entities: -\nElapsed: -");
    setError("");
    toggleSpinner(false);
    btnCopy.disabled = false;
    setModalOpenState("debugModal", !modal.classList.contains("hidden"));
}
