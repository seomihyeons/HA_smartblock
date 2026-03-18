// src/homeassistant/conflict_analyzer/run_conflict_analyzer_yaml.js
import YAML from "js-yaml";
import { pullAutomationIndexWithEditability } from "../pull_automation";

export async function runConflictAnalyzerYamlOnly({
    onlyEnabled = true,
    concurrency = 3,
} = {}) {
    const { editable } = await pullAutomationIndexWithEditability({
        concurrency,
        includeConfig: true,
    });

    const targets = onlyEnabled
        ? editable.filter((x) => String(x?.meta?.state || "").toLowerCase() === "on")
        : editable;

    const configs = targets.map((x) => x.config).filter(Boolean);

    const yamlText = YAML.dump(configs, { noRefs: true, lineWidth: -1 });

    return {
        yamlText,
        meta: { count: configs.length, onlyEnabled },
    };
}
