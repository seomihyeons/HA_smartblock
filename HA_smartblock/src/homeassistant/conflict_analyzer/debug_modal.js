import { runConflictAnalyzerYamlOnly } from "./run_conflict_analyzer_yaml";

function qs(id) { return document.getElementById(id); }

export function initConflictAnalyzerModal() {
    const btn = qs("btnDebug");
    const modal = qs("debugModal");
    const closeBtn = qs("debugModalClose");
    const backdrop = qs("debugModalBackdrop");
    const runBtn = qs("debugRun");
    const copyBtn = qs("debugCopy");
    const out = qs("debugOutput");

    function open() {
        modal.classList.remove("hidden");
    }
    function close() {
        modal.classList.add("hidden");
    }
    function setText(s) {
        out.textContent = s;
    }
    function append(s) {
        out.textContent += s;
        out.scrollTop = out.scrollHeight;
    }

    btn?.addEventListener("click", open);
    closeBtn?.addEventListener("click", close);
    backdrop?.addEventListener("click", close);

    copyBtn?.addEventListener("click", async () => {
        await navigator.clipboard.writeText(out.textContent || "");
    });

    runBtn?.addEventListener("click", async () => {
        setText("");
        append("[1/4] Pulling automations from Home Assistant...\n");

        const { yamlText, meta } = await runConflictAnalyzerYamlOnly();
        append(`[2/4] Selected automations: ${meta.count} (enabledOnly=${meta.onlyEnabled})\n`);
        append("[3/4] Sending to analyzer server...\n");

        const startRes = await fetch("/analyze/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ yaml: yamlText }),
        });
        const { jobId } = await startRes.json();

        append("[4/4] Running Python analyzer...\n\n");

        const es = new EventSource(`/analyze/stream/${encodeURIComponent(jobId)}`);

        es.addEventListener("log", (ev) => {
            const { msg } = JSON.parse(ev.data);
            append(msg);
            if (!msg.endsWith("\n")) append("\n");
        });

        es.addEventListener("error", (ev) => {
            try {
                const data = JSON.parse(ev.data);
                append("\n[ERROR]\n" + JSON.stringify(data, null, 2) + "\n");
            } catch {
                append("\n[ERROR] Stream error\n");
            }
            es.close();
        });

        es.addEventListener("done", (ev) => {
            const data = JSON.parse(ev.data);
            append("\n[DONE]\n");
            append(JSON.stringify(data.report ?? data, null, 2));
            es.close();
        });
    });
}
