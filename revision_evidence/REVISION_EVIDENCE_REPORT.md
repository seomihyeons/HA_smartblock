# HA-SmartBlock Revision Evidence Report

Generated: `2026-06-30T16:47:58+00:00` UTC
Mode: `second-pass-current-code-headless`
Code basis: root `src/` and `test/` current working tree; `ha_smartblock/` remains the Home Assistant add-on distribution variant.
Git branch: `ha-addon-dynamic-entities`
Git commit: `b2503b18d8a064c4fc1b5cb371a6b1eab9058ad1`

This second-pass update supersedes the earlier baseline-derived limitation for conversion timing. It adds a current-code headless Task Alt evaluator, reruns all 861 evaluation YAML files, adds a small labeled conflict benchmark, and audits repository metadata against the manuscript issues identified by the user. It does not invent results; unresolved items remain marked `manual_required`.

## 1. Evidence Artifacts

| Artifact | Purpose |
| --- | --- |
| `revision_evidence/scripts/headless_task_alt_eval.js` | Headless current-code evaluator using the repository importer, Blockly rendering path, YAML exporter, raw classifier, and semantic comparator. |
| `revision_evidence/scripts/webpack.headless.config.cjs` | Bundles the evaluator for Node because the project source uses webpack-oriented ES module imports. |
| `revision_evidence/evaluation/summary.json` | Machine-readable current-code evaluation summary and timing. |
| `revision_evidence/evaluation/per_automation.csv` | 861 per-automation rows with status, counts, raw usage, timing, and failure category fields. |
| `revision_evidence/evaluation/paper_tables.md` | Paper-ready second-pass conversion, raw, round-trip, failure, timing, status, and per-domain tables. |
| `revision_evidence/conflict_benchmark/labels.json` | Small labeled conflict benchmark manifest. |
| `revision_evidence/conflict_benchmark/cases/*.yaml` | Benchmark YAML cases for no conflict, direct inconsistency, redundancy, circularity, and indirect inconsistency. |
| `revision_evidence/scripts/run_conflict_benchmark.py` | Runs the Python conflict analyzer against the labeled cases. |
| `revision_evidence/conflict_benchmark/results.json` | Machine-readable conflict benchmark outputs and metrics. |
| `revision_evidence/conflict_benchmark/report.md` | Human-readable conflict benchmark report. |
| `revision_evidence/metadata_audit.md` | License, C7/C9, Home Assistant version, support email, and command audit. |

## 2. Current-Code Headless Evaluation

Command executed:

```powershell
npx webpack --config revision_evidence\scripts\webpack.headless.config.cjs
node revision_evidence\.tmp\headless_task_alt_eval.cjs --root . --out revision_evidence\evaluation
```

Webpack completed with optional dependency warnings for `canvas`, `bufferutil`, and `utf-8-validate`; these are optional transitive dependencies and did not stop the evaluator. During evaluation, Blockly emitted dropdown warnings for some static option values that were not present in local dropdown lists. The run still completed with no `ERROR` or `FAIL` rows.

Dataset rule:

- Include `test/test_*/*.yaml` and `*.yml`
- Exclude `test/test_raw_demo/**`
- Exclude `test/test_xhome_demo/**`

Dataset counts:

- Filesystem YAML total including excluded demo files: 866
- Excluded demo files: 5
- Evaluation dataset count: 861

Second-pass conversion results:

| Metric | Value |
| --- | --- |
| Total automations evaluated | 861 |
| Fully imported into editable blocks | 861 |
| Partially imported with Raw/Fallback blocks | 0 |
| Failed to import/parse | 0 |
| Export success count | 861 |
| Exact strict round-trip matches | 430 |
| Normalization-only differences | 431 |
| Semantic mismatches | 0 |
| Error count | 0 |
| Raw/Fallback block count | 0 |

Status counts:

| Status | Count |
| --- | --- |
| `PASS` | 430 |
| `PASS_WITH_NORMALIZATION` | 431 |

Timing results:

| Timing metric | Value |
| --- | --- |
| Total import time | 2523.778 ms |
| Total export time | 106.863 ms |
| Total evaluation time | 4233.057 ms |
| Average import time | 2.931 ms/file |
| Average export time | 0.124 ms/file |
| Average total time | 4.916 ms/file |

Timing definitions:

- Import time: `yamlTextToInternalJson` plus `renderAutomationToWorkspace`.
- Export time: `yamlGenerator.workspaceToCode`.
- Total time: file read, import, raw classification, export, regenerated YAML parse, and semantic comparison.

Failure taxonomy:

| Failure category | Count |
| --- | --- |
| Parse/import error | 0 |
| Export error | 0 |
| Regenerated parse/compare error | 0 |
| Semantic mismatch | 0 |
| Raw fallback used | 0 |

Interpretation:

The second-pass current-code headless run supports the claim that, in this repository working tree, HA-SmartBlock semantically preserved all 861 evaluated Home Assistant automation YAML files through import-to-block and block-to-YAML export. It also supplies local wall-clock timing for the evaluation path. It does not prove Home Assistant runtime validity, browser UI usability, or add-on container performance.

## 3. Conflict Benchmark

Command executed:

```powershell
python revision_evidence\scripts\run_conflict_benchmark.py
```

Benchmark cases:

| Case | Label | Comparable to current output? | Result |
| --- | --- | --- | --- |
| `01_no_conflict` | no conflict | yes | No inconsistency detected; correct binary result. |
| `02_direct_inconsistency` | direct inconsistency | yes | 1 inconsistency issue detected; correct binary result. |
| `03_redundancy` | redundancy | no | Not scored; current top-level analyzer output does not expose redundancy findings. |
| `04_circularity` | circularity | no | Not scored as circularity; analyzer reported 2 binary inconsistency issues, but current output does not expose circularity. |
| `05_indirect_inconsistency` | indirect inconsistency | yes | 1 inconsistency issue detected; correct binary result. |

Binary inconsistency metrics for comparable cases only:

| Metric | Value |
| --- | --- |
| Comparable cases | 3 |
| True positive | 2 |
| False positive | 0 |
| False negative | 0 |
| True negative | 1 |
| Precision | 1.000 |
| Recall | 1.000 |

Interpretation:

Precision/recall are valid only for binary inconsistency presence/absence on the three comparable cases. They should not be presented as full conflict-analyzer precision/recall across redundancy, circularity, or conflict-type classification. Direct and indirect inconsistency are both reported as generic `Inconsistency` by the current analyzer output.

## 4. Metadata Audit

Detailed evidence is in `revision_evidence/metadata_audit.md`.

| Item | Repository evidence | Status |
| --- | --- | --- |
| License | Root `package.json` and `ha_smartblock/package.json` report `Apache-2.0`; source headers also use Apache-2.0; no standalone `LICENSE` file found. | Manuscript saying MIT is a mismatch. |
| C7 dependencies | Blockly, js-yaml, dotenv, webpack stack, Node.js/npm, Python 3, PyYAML, Home Assistant base image. | Repository-supported, but exact SoftwareX wording remains `manual_required`. |
| C7 operating environment | Browser/webpack app and Home Assistant add-on container; add-on config declares `amd64`, `aarch64`, ingress, and HA API access. | Repository-supported, but tested OS/browser/HA version range remains `manual_required`. |
| C9 support email | No support email found; `repository.yaml` only lists maintainer `seomihyeons`. | `manual_required`. |
| Minimum Home Assistant version | No explicit minimum found in add-on config, README, DOCS, Dockerfile, or package metadata. | `manual_required`. |
| Install/run/test commands | Exact local app, add-on, headless evaluation, conflict benchmark, and analyzer commands are now recorded. | Repository-supported. |

License conclusion:

- Current repository evidence supports `Apache-2.0`, not MIT.
- If the manuscript says MIT, correct the manuscript or intentionally relicense the repository.
- Add a standalone `LICENSE` file before resubmission.

## 5. Revised Reviewer Concern Mapping

| Reviewer concern area | Second-pass evidence | Remaining manual work |
| --- | --- | --- |
| Quantitative conversion evidence | Current-code headless 861-file rerun in `summary.json`, `per_automation.csv`, and `paper_tables.md` | Report local timing context if used in manuscript. |
| Processing time | Import/export/total timing now measured | Hardware/software context and repeatability policy if reviewers require repeated timing. |
| Mechanism rigor | Raw/Fallback, regression path, and conflict analyzer code map retained; conflict benchmark added | Redundancy/circularity analyzer outputs still require implementation or conservative wording. |
| Positioning/novelty | Still should avoid first-visual-editor claims | External references for HA native editor, Node-RED, previous SmartBlock, and Blockly tools. |
| Usability claims | No user study/community feedback found | Keep superiority claims toned down or collect empirical evidence. |
| Reproducibility/SoftwareX metadata | Commands and dependency/environment audit added | C7 exact wording, C9 support email, minimum HA version, and final bibliography. |

## 6. Claims Supported By This Evidence

Supported with second-pass evidence:

- The current root-code headless evaluator processed 861 non-demo Task Alt YAML files.
- All 861 files exported successfully.
- All 861 files were semantically preserved according to the repository semantic comparator.
- 430 files were strict round-trip matches.
- 431 files differed only by normalization.
- No Raw/Fallback blocks were used in this dataset during the second-pass run.
- Local measured total evaluation time was 4233.057 ms for 861 files.
- The conflict analyzer correctly detected binary inconsistency presence/absence for the three comparable benchmark cases.

Not supported without further work:

- HA-SmartBlock is more usable than the Home Assistant native editor.
- HA-SmartBlock fully supports all possible Home Assistant automations.
- Conflict detection is complete.
- The analyzer detects redundancy and circularity as explicit report categories.
- The measured local timing generalizes to all hardware or to the Home Assistant add-on container.
- The project license is MIT.
- Minimum Home Assistant version or C9 support email.

## 7. Manual-Required Items

| Item | Reason |
| --- | --- |
| External comparison verification | Home Assistant native editor, Node-RED, previous SmartBlock, and other Blockly-based tools require external references/manuscript context. |
| Usability claims | No user study or community feedback dataset was found in the repository. |
| Conflict analyzer redundancy/circularity metrics | Current analyzer output does not expose redundancy or circularity categories. |
| Conflict analyzer type-level precision/recall | Current output reports generic `Inconsistency`, not direct vs indirect issue classes. |
| SoftwareX C7 exact wording | The exact SoftwareX form text was not found in the repository. |
| C9 support email | No support email was found locally. |
| Minimum Home Assistant version | No explicit minimum HA version was found locally. |
| Manuscript exact text audit | The manuscript source was not found in the inspected repository files. |
| Reference checklist bibliographic validation | Requested references must be checked against the final bibliography. |

## 8. Remaining Risks Before Resubmission

- The current quantitative evidence is a local Node/webpack headless run, not an add-on-container run inside Home Assistant.
- Timing should be reported with machine, Node, OS, and repeat-count context if used as a performance claim.
- Dropdown warnings during headless evaluation indicate some static UI option lists do not contain all encountered dataset values, even though the semantic regression result stayed passing.
- External comparison tables still require verified references and version-specific statements.
- Conflict analyzer claims must remain limited unless redundancy/circularity outputs and a larger labeled benchmark are added.
- The manuscript/license mismatch must be resolved before submission.
- The repository has local uncommitted changes outside `revision_evidence/`; final resubmission evidence should record the exact commit or archive used.
