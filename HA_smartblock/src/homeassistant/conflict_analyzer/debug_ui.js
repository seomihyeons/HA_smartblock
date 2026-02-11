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

    if (!btnDebug || !modal || !btnRun || !btnCopy || !out) return;

    const open = () => modal.classList.remove("hidden");
    const close = () => modal.classList.add("hidden");

    const copy = async () => {
        const text = out.textContent || "";
        await navigator.clipboard.writeText(text);
    };

    const run = async () => {
        setText(out, "");
        appendLine(out, "[UI] Building YAML from HA automations...");
        appendLine(out, "[Server] POST /analyze ... (this may take a while)");

        try {
            const report = await runConflictAnalyzer({ onlyEnabled: true, concurrency: 3 });
            appendLine(out, "");
            appendLine(out, "===== RESULT =====");
            appendLine(out, formatReport(report));
        } catch (e) {
            appendLine(out, "");
            appendLine(out, "===== ERROR =====");
            appendLine(out, String(e?.message || e));
        }
    };

    btnDebug.addEventListener("click", () => { open(); });
    backdrop?.addEventListener("click", close);
    btnClose?.addEventListener("click", close);
    btnCopy.addEventListener("click", copy);
    btnRun.addEventListener("click", run);
}
