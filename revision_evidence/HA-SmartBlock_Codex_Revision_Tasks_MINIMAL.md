# HA-SmartBlock Revision Evidence Tasks — MINIMAL MODE

## Purpose
Generate the minimum evidence needed to address the SoftwareX rejection points without creating too many scattered files.

Do **not** invent results. If a metric cannot be measured automatically, write `manual_required` and explain why.

## Main deliverable for the researcher
Create one primary report:

```text
revision_evidence/REVISION_EVIDENCE_REPORT.md
```

This report must be readable by itself and must summarize all results, tables, assumptions, limitations, and remaining manual work.

## Minimal supporting files
Create only these supporting files unless more are absolutely necessary:

```text
revision_evidence/evaluation/summary.json
revision_evidence/evaluation/per_automation.csv
revision_evidence/evaluation/paper_tables.md
revision_evidence/manual_required.md
```

Optional additional files may be created only when they are directly linked from `REVISION_EVIDENCE_REPORT.md`.

---

# Phase 1 — Repository inspection

In `REVISION_EVIDENCE_REPORT.md`, include a short repository map identifying the locations of:

- YAML-to-block importer/parser
- block-to-YAML exporter
- Raw/Fallback block implementation
- regression testing code
- conflict analyzer code
- dynamic block/mutator code
- Home Assistant bridge/API integration
- package/dependency files

If any component is missing or unclear, record it in `manual_required.md`.

---

# Phase 2 — 861 automation quantitative evaluation

Run the bidirectional conversion pipeline on the geekofweek Home Assistant automations if the dataset is available.

Measure and report:

- total automations
- fully imported into editable blocks
- partially imported with Raw/Fallback blocks
- failed to import
- export success count
- exact round-trip matches
- normalization-only differences
- semantic mismatches
- Raw block count
- unsupported construct types
- failure categories
- import/export/total processing time

Write machine-readable results to:

```text
revision_evidence/evaluation/summary.json
revision_evidence/evaluation/per_automation.csv
```

Write paper-ready tables to:

```text
revision_evidence/evaluation/paper_tables.md
```

At minimum, `paper_tables.md` must include:

1. Conversion success table
2. Raw/Fallback block usage table
3. Round-trip preservation table
4. Failure taxonomy table
5. Processing-time table

---

# Phase 3 — Comparison and positioning

In `REVISION_EVIDENCE_REPORT.md`, include paper-ready comparison tables for:

1. Home Assistant native automation editor vs HA-SmartBlock
2. Previous SmartBlock vs HA-SmartBlock
3. HA native editor, Node-RED, Blockly-based tools, and HA-SmartBlock

Mark any comparison that cannot be verified from the repository as `manual_required`.

The revised positioning should emphasize that HA-SmartBlock is not claimed as the first visual editor for Home Assistant. Instead, position it as a Blockly/ECA-based round-trip engineering environment with Raw block preservation, regression testing, Home Assistant integration, and conflict analysis.

---

# Phase 4 — Mechanism rigor

In `REVISION_EVIDENCE_REPORT.md`, include concise specifications for:

## Raw/Fallback block
Explain:

- what is stored in a Raw block
- whether it is editable or read-only
- how it is validated
- how it is reinserted during export
- whether preservation is syntactic or semantic
- current limitations

## Regression testing
Explain:

- baseline recording
- YAML import
- YAML regeneration
- normalization
- diff classification
- definitions of `exact`, `normalization-only`, `semantic mismatch`, `parse fail`, and `export fail`

## Conflict Analyzer
Explain:

- formal definitions of redundancy, direct inconsistency, indirect inconsistency, and circularity
- whether detection is entity/service-level or semantic-level
- detection rules or pseudocode
- limitations and false-positive/false-negative risks

If possible, add a small conflict benchmark summary. If not possible, mark as `manual_required`.

---

# Phase 5 — Usability and community feedback

In `REVISION_EVIDENCE_REPORT.md`, include:

1. A list of usability-related claims in the manuscript that should be toned down unless a user study is performed.
2. A short plan for Home Assistant community feedback as formative evaluation.
3. A short user-study protocol comparing HA native editor and HA-SmartBlock.
4. A note about the long-list problem for entities/devices/services and whether the current UI supports search, domain grouping, or context-sensitive filtering.

Do not claim HA-SmartBlock is more usable than the native Home Assistant editor unless empirical data exists.

---

# Phase 6 — Reproducibility and SoftwareX metadata

In `REVISION_EVIDENCE_REPORT.md`, include:

- completed SoftwareX metadata draft, especially C7 and C9
- dependency inventory: frontend, backend, Python, Docker, Home Assistant version requirements
- installation/run/test commands
- reference checklist: Home Assistant native editor, Node-RED, Blockly, previous SmartBlock, EUP, IoT rule management, conflict detection, Gallo 2024, Funk 2018, Mattioli & Paternò 2020
- claim hygiene table: strong claim, problem, safer revised wording

---

# Final report structure

`REVISION_EVIDENCE_REPORT.md` must contain:

1. Executive summary
2. Reviewer concern → evidence mapping
3. Quantitative evaluation results
4. Paper-ready tables
5. Comparison and positioning tables
6. Raw block, regression test, and conflict analyzer specifications
7. Usability/community-feedback/user-study plan
8. Reproducibility and SoftwareX metadata
9. Claims to tone down
10. Manual-required items
11. Remaining risks before resubmission
