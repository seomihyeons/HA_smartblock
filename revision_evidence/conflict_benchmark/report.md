# Conflict Analyzer Second-Pass Benchmark

Generated: `2026-06-30T16:47:58.035008+00:00`

This benchmark is intentionally small and labeled. The current analyzer output is comparable only as binary inconsistency presence/absence for selected cases.

## Binary Inconsistency Metrics
| Metric | Value |
| --- | --- |
| Comparable cases | 3 |
| TP | 2 |
| FP | 0 |
| FN | 0 |
| TN | 1 |
| Precision | 1.000 |
| Recall | 1.000 |

## Case-by-Case Results
| Case | Label | Comparable | Expected binary inconsistency | Detected binary inconsistency | Issues | Result | Unsupported reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01_no_conflict | no_conflict | True | False | False | 0 | True |  |
| 02_direct_inconsistency | direct_inconsistency | True | True | True | 1 | True |  |
| 03_redundancy | redundancy | False | False | False | 0 | unsupported_by_current_output | Current analyzer output does not expose a redundancy issue type. |
| 04_circularity | circularity | False | False | True | 2 | unsupported_by_current_output | Tarjan SCC helper exists in code, but current analyze_ha_automations output does not report circularity. |
| 05_indirect_inconsistency | indirect_inconsistency | True | True | True | 1 | True |  |

## Interpretation

- `direct_inconsistency` and `indirect_inconsistency` are evaluated only as binary inconsistency because the analyzer currently reports issue type `Inconsistency`.
- `redundancy` is labeled but not scored because the current top-level output does not expose redundancy findings.
- `circularity` is labeled but not scored because the current top-level output does not expose circularity findings, even though SCC helper code exists internally.
