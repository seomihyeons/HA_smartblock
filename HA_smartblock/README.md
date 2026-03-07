# HA Smart Block — Developer Guide

This folder contains the core application, tooling, and developer utilities.

## Core Flow
- Blocks → YAML: `src/generators/`
- YAML → Blocks: `src/import/`
- Toolbox & options: `src/toolbox.js`, `src/data/options.js`
- Workspace persistence: `src/serialization.js`
- HA integration: `src/homeassistant/`

## Run Locally
```bash
npm install
npm run start
```

## Home Assistant Integration
Set environment variables to enable live pull/push.
- `HA_BASE_URL` or `HA_IP` / `HA_PORT`
- `HA_TOKEN`

## Conflict Analyzer
- UI entry: 🛠 button → Run (sends request only)
- Analyzer server must be running only if you use Conflict Analyzer:
```bash
node server/analyze_server.js
```
- Python analyzer: `src/homeassistant/conflict_analyzer/ha_eca_conflict_analyzer.py`
- Requires Python 3 + PyYAML
- Analyzer repo: https://github.com/kwanghoon/haanalyzer

## Task Alt Verification
- UI entry: ⛏ inside the app
- Datasets: `test/test_*`
- Baseline stored via local dev server API
- Regression report highlights status, count, and RAW changes

## Security Notes
- Dev server and analyzer are local-only by default.
- Do not expose the dev server publicly when using HA_TOKEN.

## Key Directories
- `src/blocks/` block definitions
- `src/import/` YAML parsing, normalization, mapping
- `src/generators/` YAML generators
- `src/homeassistant/` HA pull/push and analyzer integration
- `test/task_alt/` Task Alt logic and baseline utilities
