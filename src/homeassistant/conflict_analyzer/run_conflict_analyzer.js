export async function runConflictAnalyzer({ onlyEnabled = true, concurrency = 8 } = {}) {
    const res = await fetch("/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            mode: "ha",
            onlyEnabled,
            concurrency,
        }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Analyze failed: ${res.status} ${JSON.stringify(body)}`);

    return body.report ?? body;
}
