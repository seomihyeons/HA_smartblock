import { runConflictAnalyzer } from "./run_conflict_analyzer";
import { setModalOpenState } from "../../utils/floating_modal_state";

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

function summarizeConflictTypes(issues) {
    const counts = {};
    for (const issue of Array.from(issues || [])) {
        const key = String(issue?.issue || "unknown");
        counts[key] = Number(counts[key] || 0) + 1;
    }
    const names = Object.keys(counts).sort((a, b) => a.localeCompare(b));
    if (!names.length) return "-";
    return names.map((name) => `${name}=${counts[name]}`).join(", ");
}

function countConflictingEntities(issues) {
    const entities = new Set();
    for (const issue of Array.from(issues || [])) {
        const entity = String(issue?.entity || "").trim();
        if (entity) entities.add(entity);
    }
    return entities.size;
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

    const buildSummary = (report, elapsedMs) => {
        const s = report?.summary || {};
        const issues = Array.isArray(report?.inconsistency) ? report.inconsistency : [];
        const incCount = s.inconsistency_issues ?? issues.length ?? "-";
        const elapsed = elapsedMs != null ? `${elapsedMs} ms` : "-";
        const conflictTypes = summarizeConflictTypes(issues);
        const conflictingEntities = countConflictingEntities(issues);
        const lines = [
            `Automations analyzed: ${s.automations ?? "-"}`,
            `Events: ${s.events ?? "-"}`,
            `Actions: ${s.actions ?? "-"}`,
            `Rule edges: ${s.edges ?? "-"}`,
            `Inconsistency issues: ${incCount}`,
            `Conflict types: ${conflictTypes}`,
            `Conflicting entities: ${incCount === "-" ? "-" : conflictingEntities}`,
            `Elapsed: ${elapsed}`,
        ];

        if (incCount === 0) {
            lines.push("");
            lines.push("No inconsistency detected.");
            lines.push("System logic is consistent.");
        }

        return lines.join("\n");
    };

    const classifyError = (err) => {
        const msg = String(err?.message || err || "Unknown error");
        if (msg.includes("Failed to fetch")) {
            return "Analyzer server not running or unreachable. Start the analyzer server and retry.";
        }
        if (msg.startsWith("Analyze failed:")) {
            return `Analyzer request failed. ${msg}`;
        }
        return `Unexpected error: ${msg}`;
    };

    const run = async () => {
        setText(out, "");
        setSummary("Automations analyzed: -\nEvents: -\nActions: -\nRule edges: -\nInconsistency issues: -\nConflict types: -\nConflicting entities: -\nElapsed: running...");
        setError("");
        setStatus("running", "Analyzing...");
        toggleSpinner(true);
        btnRun.disabled = true;

        const startedAt = performance.now();
        try {
            const report = await runConflictAnalyzer({ onlyEnabled: true, concurrency: 8 });
            const ms = Math.round(performance.now() - startedAt);
            setSummary(buildSummary(report, ms));
            renderIssueCards(out, report);
            setStatus("done", "Analysis Complete");
        } catch (e) {
            const msg = classifyError(e);
            setText(out, String(e?.message || e));
            setError(msg);
            const ms = Math.round(performance.now() - startedAt);
            setSummary(buildSummary(null, ms));
            setStatus("error", "Error");
        } finally {
            toggleSpinner(false);
            btnRun.disabled = false;
        }
    };

    btnDebug.addEventListener("click", () => { open(); });
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
