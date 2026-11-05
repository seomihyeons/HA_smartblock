// Shared presentation for the standalone analyzer and the AI chat.
// Do not infer that a static analysis verifies actual runtime behavior.
export function summarizeConflictTypes(issues = []) {
    const counts = {};
    for (const issue of Array.isArray(issues) ? issues : []) {
        const key = String(issue?.issue || "unknown");
        counts[key] = Number(counts[key] || 0) + 1;
    }
    const names = Object.keys(counts).sort((a, b) => a.localeCompare(b));
    return names.length ? names.map((name) => `${name}=${counts[name]}`).join(", ") : "-";
}

export function countConflictingEntities(issues = []) {
    const entities = new Set();
    for (const issue of Array.isArray(issues) ? issues : []) {
        const entity = String(issue?.entity || "").trim();
        if (entity) entities.add(entity);
    }
    return entities.size;
}

export function buildConflictSummary(report, elapsedMs = null) {
    const s = report?.summary || {};
    const issues = Array.isArray(report?.inconsistency) ? report.inconsistency : [];
    const incCount = s.inconsistency_issues ?? issues.length ?? "-";
    const elapsed = elapsedMs != null ? `${elapsedMs} ms` : "-";
    const lines = [
        `Automations analyzed: ${s.automations ?? "-"}`,
        ...(report?.analysis_scope?.draft_count ? [
            `Analysis scope: ${report.analysis_scope.existing_count} existing + ${report.analysis_scope.draft_count} current draft`,
        ] : []),
        `Events: ${s.events ?? "-"}`,
        `Actions: ${s.actions ?? "-"}`,
        `Rule edges: ${s.edges ?? "-"}`,
        `Inconsistency issues: ${incCount}`,
        `Conflict types: ${summarizeConflictTypes(issues)}`,
        `Conflicting entities: ${incCount === "-" ? "-" : countConflictingEntities(issues)}`,
        `Elapsed: ${elapsed}`,
    ];
    if (incCount === 0) {
        lines.push("", "No inconsistency detected.", "System logic is consistent.");
    }
    return lines.join("\n");
}

export function formatConflictChatReport(report, elapsedMs = null) {
    const summary = buildConflictSummary(report, elapsedMs);
    const issues = Array.isArray(report?.inconsistency) ? report.inconsistency : [];
    const count = Number(report?.summary?.inconsistency_issues ?? issues.length) || 0;
    if (count === 0) return summary;
    const lines = [summary, "", `Detected ${count} inconsistency issue(s)`];
    issues.forEach((issue, index) => {
        lines.push("", `Issue ${index + 1} · ${String(issue?.issue || "Issue")}`);
        for (const [label, value] of [
            ["Trigger", issue?.event],
            ["Action 1", issue?.action1],
            ["Action 2", issue?.action2],
            ["Entity", issue?.entity],
        ]) {
            if (value != null && String(value).trim()) lines.push(`${label}: ${value}`);
        }
    });
    if (!issues.length) lines.push("No detailed issue list provided by analyzer.");
    else lines.push("", "Two rules triggered by the same event produce conflicting actions.");
    return lines.join("\n");
}

export function classifyConflictError(err) {
    const message = String(err?.message || err || "Unknown error");
    if (message.includes("Failed to fetch")) {
        return "Analyzer server not running or unreachable. Start the analyzer server and retry.";
    }
    if (message.startsWith("Analyze failed:")) return `Analyzer request failed. ${message}`;
    return `Unexpected error: ${message}`;
}
