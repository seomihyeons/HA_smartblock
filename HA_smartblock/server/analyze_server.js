// HA_smartblock/server/analyze_server.js
import express from "express";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "10mb" }));

const PY_PATH = path.resolve(
    __dirname,
    "../src/homeassistant/conflict_analyzer/ha_eca_conflict_analyzer.py"
);
const PY_CMD = "python";

function buildHaBaseUrl() {
    if (process.env.HA_BASE_URL) return process.env.HA_BASE_URL;
    const ip = process.env.HA_IP;
    const port = process.env.HA_PORT || "8123";
    if (!ip) return "";
    return `http://${ip}:${port}`;
}

app.post("/analyze", (req, res) => {
    const mode = req.body?.mode || "yaml"; // "ha" or "yaml"

    const haBase = buildHaBaseUrl();
    const haToken = process.env.HA_TOKEN || "";

    let args = [PY_PATH, "--out", "stdout"];

    if (mode === "ha") {
        if (!haBase || !haToken) {
            return res.status(500).json({ error: "Missing HA_BASE_URL(or HA_IP/HA_PORT) or HA_TOKEN in server .env" });
        }
        args = [PY_PATH, "--ha", "--out", "stdout", "--concurrency", String(req.body?.concurrency ?? 3)];
    } else {
        const yamlText = req.body?.yaml;
        if (!yamlText) return res.status(400).json({ error: "Missing body.yaml" });
    }

    const p = spawn(PY_CMD, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
            ...process.env,
            HA_BASE_URL: haBase,
            HA_TOKEN: haToken,
        },
    });

    let out = "";
    let err = "";

    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));

    p.on("close", (code) => {
        if (code !== 0) {
            return res.status(500).json({ error: `python exited ${code}`, stderr: err, stdout: out });
        }
        try {
            const report = JSON.parse(out);
            return res.json({ report, stderr: err });
        } catch {
            return res.status(500).json({ error: "Failed to parse python stdout as JSON", stdout: out, stderr: err });
        }
    });

    if (mode !== "ha") {
        p.stdin.write(req.body.yaml);
        p.stdin.end();
    } else {
        p.stdin.end();
    }
});

app.listen(8787, () => {
    console.log("Analyzer server listening on http://localhost:8787");
});
