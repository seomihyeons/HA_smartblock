export async function runConflictAnalyzer({ onlyEnabled = true, concurrency = 8, draftYaml = null, automationId = null } = {}) {
    const res = await fetch("/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            mode: "ha",
            onlyEnabled,
            concurrency,
            ...(draftYaml ? { draftYaml, automationId } : {}),
        }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Analyze failed: ${res.status} ${JSON.stringify(body)}`);

    return body.report ?? body;
}
