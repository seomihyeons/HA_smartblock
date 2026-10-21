import YAML from "js-yaml";
import { pullAutomationIndexWithEditability } from "../pull_automation";

async function buildDraftComparisonYaml(draftYaml, { onlyEnabled, concurrency }) {
    const { editable } = await pullAutomationIndexWithEditability({
        concurrency: Math.min(concurrency, 4),
        includeConfig: true,
    });
    const existing = (onlyEnabled
        ? editable.filter((item) => String(item?.meta?.state || "").toLowerCase() === "on")
        : editable
    ).map((item) => item.config).filter(Boolean);

    const parsedDraft = YAML.load(String(draftYaml || ""));
    const drafts = Array.isArray(parsedDraft) ? parsedDraft : [parsedDraft].filter(Boolean);
    return YAML.dump([...existing, ...drafts], { noRefs: true, lineWidth: -1 });
}

export async function runConflictAnalyzer({
    onlyEnabled = true,
    concurrency = 8,
    draftYaml = null,
} = {}) {
    const yaml = draftYaml
        ? await buildDraftComparisonYaml(draftYaml, { onlyEnabled, concurrency })
        : null;
    const res = await fetch("/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            mode: yaml ? "yaml" : "ha",
            onlyEnabled,
            concurrency,
            ...(yaml ? { yaml } : {}),
        }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Analyze failed: ${res.status} ${JSON.stringify(body)}`);

    return body.report ?? body;
}
