import YAML from "js-yaml";
import { pullAutomationIndexWithEditability } from "../pull_automation";

export async function runConflictAnalyzer({ onlyEnabled = true, concurrency = 3 } = {}) {
    const { editable } = await pullAutomationIndexWithEditability({
        concurrency,
        includeConfig: true,
    });

    const targets = onlyEnabled
        ? editable.filter((x) => String(x?.meta?.state || "").toLowerCase() === "on")
        : editable;

    const configs = targets.map((x) => x.config).filter(Boolean);
    const yamlText = YAML.dump(configs, { noRefs: true, lineWidth: -1 });

    const res = await fetch("/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml: yamlText }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Analyze failed: ${res.status} ${JSON.stringify(body)}`);

    return body.report ?? body;
}
