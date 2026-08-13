# Paper-Ready Second-Pass Evaluation Tables

Generated: `2026-06-30T16:46:49.408Z`
Mode: `current-code-headless`

## Conversion Success Table
| Metric | Value | Evidence source |
| --- | --- | --- |
| Total automations evaluated | 861 | Current-code headless run |
| Fully imported into editable blocks | 861 | status != ERROR and raw_count=0 |
| Partially imported with Raw/Fallback blocks | 0 | raw_count>0 or PASS_WITH_RAW |
| Failed to import/parse | 0 | parse_or_import_error |
| Export success count | 861 | Generated YAML available |

## Raw/Fallback Block Usage Table
| Raw/Fallback metric | Value | Notes |
| --- | --- | --- |
| Raw block count | 0 | Sum of raw_count in current headless run |
| Automations using Raw/Fallback | 0 | Rows with raw_count>0 or PASS_WITH_RAW |
| Unsupported construct types observed through Raw blocks | none recorded | Current headless run |

## Round-Trip Preservation Table
| Round-trip class | Count | Definition |
| --- | --- | --- |
| Exact | 430 | PASS; strict stable JSON equality and semantic equality |
| Normalization-only | 431 | PASS_WITH_NORMALIZATION; semantic equality after normalization |
| Semantic mismatch | 0 | FAIL; normalized semantics differ |
| Error | 0 | ERROR; exception during parse/render/export/compare path |

## Failure Taxonomy Table
| Failure category | Count | Status/basis |
| --- | --- | --- |
| Parse/import error | 0 | Exception before regenerated YAML |
| Export error | 0 | Exception during YAML generation |
| Regenerated parse/compare error | 0 | Exception after regenerated YAML |
| Semantic mismatch | 0 | FAIL |
| Raw fallback used | 0 | PASS_WITH_RAW or raw_count>0 |

## Processing-Time Table
| Processing-time metric | Value (ms) | Definition |
| --- | --- | --- |
| Import time | 2523.778 | Sum of YAML parse plus renderAutomationToWorkspace |
| Export time | 106.863 | Sum of yamlGenerator.workspaceToCode |
| Total time | 4233.057 | Sum of full per-file evaluation path |
| Average import time | 2.931 | Import time divided by evaluated automations |
| Average export time | 0.124 | Export time divided by evaluated automations |
| Average total time | 4.916 | Total time divided by evaluated automations |

## Status Count Detail
| Status | Count |
| --- | --- |
| PASS | 430 |
| PASS_WITH_NORMALIZATION | 431 |

## Per-Domain Status Detail
| Domain keyword | Total | Statuses |
| --- | --- | --- |
| 3d_printer | 52 | PASS=47, PASS_WITH_NORMALIZATION=5 |
| alarm | 20 | PASS=8, PASS_WITH_NORMALIZATION=12 |
| bedtime | 17 | PASS=6, PASS_WITH_NORMALIZATION=11 |
| blinds | 55 | PASS_WITH_NORMALIZATION=55 |
| bug_zapper | 6 | PASS=6 |
| camera | 30 | PASS=16, PASS_WITH_NORMALIZATION=14 |
| christmas | 22 | PASS_WITH_NORMALIZATION=22 |
| climate | 40 | PASS=10, PASS_WITH_NORMALIZATION=30 |
| doors | 6 | PASS=6 |
| energy | 5 | PASS_WITH_NORMALIZATION=5 |
| fans | 26 | PASS_WITH_NORMALIZATION=26 |
| fountain | 11 | PASS=11 |
| garage | 21 | PASS=4, PASS_WITH_NORMALIZATION=17 |
| holiday | 28 | PASS_WITH_NORMALIZATION=28 |
| ios_actions | 24 | PASS=3, PASS_WITH_NORMALIZATION=21 |
| laundry | 7 | PASS=7 |
| led_clock | 80 | PASS=36, PASS_WITH_NORMALIZATION=44 |
| lights | 75 | PASS=45, PASS_WITH_NORMALIZATION=30 |
| location | 51 | PASS=38, PASS_WITH_NORMALIZATION=13 |
| locks | 6 | PASS=1, PASS_WITH_NORMALIZATION=5 |
| media | 38 | PASS=10, PASS_WITH_NORMALIZATION=28 |
| motion | 76 | PASS=63, PASS_WITH_NORMALIZATION=13 |
| network | 5 | PASS=3, PASS_WITH_NORMALIZATION=2 |
| occupancy | 2 | PASS=1, PASS_WITH_NORMALIZATION=1 |
| roomba | 88 | PASS=63, PASS_WITH_NORMALIZATION=25 |
| system | 32 | PASS=21, PASS_WITH_NORMALIZATION=11 |
| vacation | 7 | PASS=2, PASS_WITH_NORMALIZATION=5 |
| water_works | 22 | PASS=20, PASS_WITH_NORMALIZATION=2 |
| weather | 9 | PASS=3, PASS_WITH_NORMALIZATION=6 |
