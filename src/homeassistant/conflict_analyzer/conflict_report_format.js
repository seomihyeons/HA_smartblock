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

export function allConflictIssues(report = {}) {
    return [
        ...(Array.isArray(report?.redundancy) ? report.redundancy : []),
        ...(Array.isArray(report?.inconsistency) ? report.inconsistency : []),
        ...(Array.isArray(report?.circularity) ? report.circularity : []),
    ];
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
    const issues = allConflictIssues(report);
    const redCount = s.redundancy_issues ?? (Array.isArray(report?.redundancy) ? report.redundancy.length : "-");
    const incCount = s.inconsistency_issues ?? (Array.isArray(report?.inconsistency) ? report.inconsistency.length : "-");
    const cirCount = s.circularity_issues ?? (Array.isArray(report?.circularity) ? report.circularity.length : "-");
    const totalCount = s.total_issues ?? (issues.length || (incCount === "-" ? "-" : Number(redCount) + Number(incCount) + Number(cirCount)));
    const elapsed = elapsedMs != null ? `${elapsedMs} ms` : "-";
    const lines = [
        `Automations analyzed: ${s.automations ?? "-"}`,
        ...(report?.analysis_scope?.draft_count ? [
            `Analysis scope: ${report.analysis_scope.existing_count} existing + ${report.analysis_scope.draft_count} current draft`,
        ] : []),
        `Events: ${s.events ?? "-"}`,
        `Actions: ${s.actions ?? "-"}`,
        `Rule edges: ${s.edges ?? "-"}`,
        `Redundancy issues: ${redCount}`,
        `Inconsistency issues: ${incCount}`,
        `Circularity issues: ${cirCount}`,
        `Total issues: ${totalCount}`,
        `Conflict types: ${summarizeConflictTypes(issues)}`,
        `Conflicting entities: ${incCount === "-" ? "-" : countConflictingEntities(issues)}`,
        `Elapsed: ${elapsed}`,
    ];
    if (totalCount === 0) {
        lines.push("", "No structural issue detected.", "System logic is consistent.");
    }
    return lines.join("\n");
}

export function formatConflictChatReport(report, elapsedMs = null) {
    const issues = allConflictIssues(report);
    const count = Number(report?.summary?.total_issues ?? issues.length) || 0;
    // The assistant panel is a conversational summary, not the analyzer's
    // diagnostics surface. Keep its no-conflict result to one factual line.
    const existingCount = report?.analysis_scope?.existing_count
        ?? report?.summary?.automations
        ?? 0;
    if (count === 0) {
        return `No conflicts found with ${existingCount} active Home Assistant automations.`;
    }

    const lines = [`${count} potential conflict${count === 1 ? '' : 's'} found`];
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
        const action1 = String(issue?.action1 || 'Action 1').trim();
        const action2 = String(issue?.action2 || 'Action 2').trim();
        const entity = String(issue?.entity || '').trim();
        const event = String(issue?.event || '').trim();
        lines.push(
            `${action1} and ${action2} may produce incompatible results`
            + `${entity ? ` for ${entity}` : ''}${event ? ` following the trigger: ${event}` : ''}.`,
        );
    });
    if (!issues.length) lines.push("No detailed issue list provided by analyzer.");
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
