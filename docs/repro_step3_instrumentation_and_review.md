# Reproduction Step 3 Instrumentation And Review

Step 3 focused on instrumentation quality for the existing minimal reproduction setup. It did not expand Sasha or SAGE to a full benchmark.

## What Was Changed

| Area | Change | Output |
|---|---|---|
| SAGE callback instrumentation | Added a machine-readable callback handler through `sage/utils/logging_utils.py:get_callback_handlers()`. It records `on_llm_start`, `on_llm_end`, `on_llm_error`, `on_tool_start`, `on_tool_end`, `on_tool_error`, `on_agent_action`, and `on_agent_finish`. | Per-case `llm_calls.jsonl` and `tool_calls.jsonl` under each SAGE trace directory |
| SAGE run aggregation | Extended `ha_llm_control/reproductions/sage/runners/run_subset.py` to write per-case manifests and a cumulative summary. | `ha_llm_control/reproductions/sage/results/step3_instrumented_cases/{case}/run_manifest.json`, `summary.csv` |
| SAGE trace extraction | Added a small extractor for component/capability selections from `tool_calls.jsonl` or legacy `viz.log`. | `ha_llm_control/reproductions/sage/runners/extract_tool_selections.py` |
| Sasha candidate review | Added a review sampler for offline candidate flags. It enriches candidates from the processed JSONL where needed. | `ha_llm_control/reproductions/sasha/evaluation/candidate_review_sample.md` |

## SAGE Exact Call Counter Design

| Field | Recorded source | Notes |
|---|---|---|
| LLM call count | `on_llm_start` callback rows | Counted as provider-attempt calls. This is stricter than Step 2 approximate `LLMChain` log counting. |
| LLM end count | `on_llm_end` callback rows | A successful provider completion should increment this. |
| LLM error count | `on_llm_error` callback rows | Provider errors are recorded separately from normal completions. |
| Model name | LangChain serialized model metadata or `llm_output` | Step 3 runs recorded `gpt-4`. |
| Prompt token estimate | Character count divided by 4 | Marked as `chars_div_4_rough`; this is not exact tokenizer accounting. |
| Case context | `SAGE_CURRENT_CASE`, trace path, LangChain chain stack | Stored in each JSONL event. |
| Tool trace | LangChain tool and agent callbacks | Stored separately from LLM events. |

## SAGE Step 3 Minimal Case Rerun

The three requested cases were rerun as separate single-case processes to avoid one failed case contaminating the next case through open Chroma index files.

| Case | Result | Exact LLM calls | LLM ends | LLM errors | Prompt token estimate | Tool calls | Trace directory |
|---|---|---:|---:|---:|---:|---:|---|
| `turn_on_bedside_light` | failure, provider quota 429 | 1 | 0 | 1 | 767 | 0 | `ha_llm_control/reproductions/sage/source/subset_test/2026-07-01T15-38-10/turn_on_bedside_light` |
| `turn_on_tv` | failure, provider quota 429 | 1 | 0 | 1 | 764 | 0 | `ha_llm_control/reproductions/sage/source/subset_test/2026-07-01T15-39-28/turn_on_tv` |
| `check_freezer_temp` | failure, provider quota 429 | 1 | 0 | 1 | 773 | 0 | `ha_llm_control/reproductions/sage/source/subset_test/2026-07-01T15-40-58/check_freezer_temp` |

Summary file:

```text
ha_llm_control/reproductions/sage/results/step3_instrumented_cases/summary.csv
```

Per-case manifests:

```text
ha_llm_control/reproductions/sage/results/step3_instrumented_cases/turn_on_bedside_light/run_manifest.json
ha_llm_control/reproductions/sage/results/step3_instrumented_cases/turn_on_tv/run_manifest.json
ha_llm_control/reproductions/sage/results/step3_instrumented_cases/check_freezer_temp/run_manifest.json
```

## SAGE Failure Interpretation

The Step 3 rerun did not reach SmartThings tool selection. All three cases failed at the first `gpt-4` provider call with:

```text
RateLimitError: You exceeded your current quota
```

Therefore, the Step 3 rerun cannot be used as a fresh baseline pass/fail comparison against Step 2. It is useful only as evidence that the exact callback counter records LLM start/error events and writes case manifests correctly.

For the historical Step 2 `check_freezer_temp` failure trace, the selected component/capability sequence was:

| Source | Device | Component | Capability | Attribute | Result context |
|---|---|---|---|---|---|
| Step 2 trace, `viz.log` | `51f02f33-4b43-11bf-2a6d-e7b5cf5be0ee` | `main` | `switch` | `switch` | Returned no such capability. |
| Step 2 trace, `viz.log` | `51f02f33-4b43-11bf-2a6d-e7b5cf5be0ee` | `main` | `temperatureMeasurement` | `temperature` | Returned `None`; expected freezer temperature was `-17`. |

This Step 2 extraction is included only as historical failure context. It was generated mechanically with:

```text
ha_llm_control/reproductions/sage/runners/extract_tool_selections.py
```

Evidence file:

```text
ha_llm_control/reproductions/sage/results/step3_instrumented_cases/check_freezer_temp/step2_failure_component_capability.json
```

The Step 3 `check_freezer_temp` manifest correctly reports no component/capability selection because the provider call failed before the planner selected any tool.

## Sasha Candidate Review

The Sasha review sample was generated from stored offline responses only. No provider calls were made.

| Candidate type | Count |
|---|---:|
| false positive candidate | 19 |
| relevance candidate | 66 |
| missing status candidate | 1 |
| total candidate rows | 86 |

Review output:

```text
ha_llm_control/reproductions/sasha/evaluation/candidate_review_sample.md
```

The review sample contains 10 representative rows with:

| Included field | Source |
|---|---|
| command | candidate row or processed JSONL |
| home | processed JSONL enrichment when absent from candidate row |
| home_supports_goal | candidate row or processed JSONL |
| relevant_device_types | candidate row or processed JSONL |
| response.status | candidate row or processed JSONL derived field |
| response target devices | compacted from response device paths |

The checklist in `candidate_review_sample.md` is intended to separate real model errors from label ambiguity, taxonomy mismatch, and subjective command interpretation.

## What Was Not Done

| Item | Status | Reason |
|---|---|---|
| SAGE full benchmark | not run | The current provider quota failure would make the full run fail early and would not produce meaningful performance evidence. |
| SAGE prompt/planner fix | not changed | Step 3 was instrumentation-only; the baseline behavior was intentionally preserved. |
| `check_freezer_temp` behavioral fix | not changed | The task asked to extract the failure trace, not to change planner constraints. |
| Sasha zero-shot provider rerun | not run | Step 3 remained offline and used stored dataset responses only. |
| Sasha precision/recall claim | not reported | The candidate flags are heuristic until a human labels the review sample. |

## Next TODO

| Priority | Task | Exit criterion |
|---:|---|---|
| 1 | Resolve the OpenAI quota/blocking provider issue or configure an approved alternate provider. | The same three SAGE cases complete beyond the first LLM call. |
| 2 | Rerun only the same three SAGE minimal cases with Step 3 instrumentation. | `llm_end_count == llm_call_count` for successful provider calls and tool trace is non-empty when tools are selected. |
| 3 | Re-check `check_freezer_temp` component/capability extraction from the new Step 3 JSONL trace. | `run_manifest.json` contains the selected SmartThings component/capability sequence. |
| 4 | Manually label the 10 Sasha candidate examples. | Decide which flags are true errors versus label/taxonomy/subjectivity issues. |
| 5 | Consider a larger benchmark only after the three-case rerun is stable. | Minimal case instrumentation is reliable and provider quota is no longer blocking. |
