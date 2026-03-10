import { runConflictAnalyzer } from "./run_conflict_analyzer";

function $(id) { return document.getElementById(id); }
function setText(el, text) { if (el) el.textContent = text; }
function appendLine(el, line) {
    if (!el) return;
    const cur = el.textContent || "";
    el.textContent = cur + (cur.endsWith("\n") || cur.length === 0 ? "" : "\n") + line;
}

function formatReport(report) {
    if (!report) return "No report.";

    const s = report.summary || {};
    const issues = Array.isArray(report.inconsistency) ? report.inconsistency : [];

    let txt = "";
    txt += "✔ Analysis Complete\n\n";
    txt += `Automations analyzed: ${s.automations ?? 0}\n`;
    txt += `Events: ${s.events ?? 0}\n`;
    txt += `Actions: ${s.actions ?? 0}\n`;
    txt += `Rule edges: ${s.edges ?? 0}\n\n`;

    const incCount = s.inconsistency_issues ?? issues.length ?? 0;

    if (!issues.length && incCount === 0) {
        txt += "No inconsistency detected.\n";
        txt += "System logic is consistent.";
        return txt;
    }

    txt += `⚠ Detected ${incCount} inconsistency issue(s)\n\n`;

    if (!issues.length) {
        txt += "(No detailed issue list provided by analyzer.)";
        return txt;
    }

    issues.forEach((iss, i) => {
        const issueType = iss.issue || "Issue";
        txt += `--- Issue ${i + 1} (${issueType}) ---\n`;
        if (iss.event) txt += `Trigger: ${iss.event}\n`;
        if (iss.action1) txt += `Action 1: ${iss.action1}\n`;
        if (iss.action2) txt += `Action 2: ${iss.action2}\n`;
        if (iss.entity != null) txt += `Entity: ${iss.entity}\n`;
        txt += "\n";
    });

    txt += "Explanation: Two rules triggered by the same event produce conflicting actions.";
    return txt;
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

    const open = () => modal.classList.remove("hidden");
    const close = () => modal.classList.add("hidden");

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
        summaryEl.textContent = text || "Automations: -\nInconsistency issues: -\nElapsed: -";
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
        return [
            `Automations: ${s.automations ?? "-"}`,
            `Events: ${s.events ?? "-"}`,
            `Actions: ${s.actions ?? "-"}`,
            `Rule edges: ${s.edges ?? "-"}`,
            `Inconsistency issues: ${incCount}`,
            `Elapsed: ${elapsed}`,
        ].join("\n");
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
        setSummary("Automations: -\nEvents: -\nActions: -\nRule edges: -\nInconsistency issues: -\nElapsed: running...");
        setError("");
        setStatus("running", "Running...");
        toggleSpinner(true);
        btnRun.disabled = true;
        appendLine(out, "[UI] Building YAML from HA automations...");
        appendLine(out, "[Server] POST /analyze ... (this may take a while)");

        const startedAt = performance.now();
        try {
            const report = await runConflictAnalyzer({ onlyEnabled: true, concurrency: 3 });
            appendLine(out, "");
            appendLine(out, "===== RESULT =====");
            appendLine(out, formatReport(report));
            const ms = Math.round(performance.now() - startedAt);
            setSummary(buildSummary(report, ms));
            setStatus("done", "Done");
        } catch (e) {
            appendLine(out, "");
            appendLine(out, "===== ERROR =====");
            const msg = classifyError(e);
            appendLine(out, String(e?.message || e));
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

    setStatus("idle", "Idle");
    setSummary("Automations: -\nEvents: -\nActions: -\nRule edges: -\nInconsistency issues: -\nElapsed: -");
    setError("");
    toggleSpinner(false);
    btnCopy.disabled = false;
}
