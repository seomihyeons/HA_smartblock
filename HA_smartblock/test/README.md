# Test & Regression Datasets

This directory contains large YAML datasets used to verify round‑trip conversion quality and regressions.

## Task Alt (Batch Verification)
- Logic: `test/task_alt/`
- Flow: import → render → regenerate → compare
- Output: PASS / PASS_WITH_RAW / FAIL summaries

## Regression Baseline
- Baseline snapshots stored via local dev server API
- Compares current results against the latest baseline
- Reports status diff, count diff, RAW diff, new/missing files

## Dataset Folders
- `test/test_*` folders are grouped by scenario category
- Each file is a Home Assistant automation YAML example

## Notes
- Datasets are large and intended for verification use
- If publishing publicly, verify that entity names are anonymized
