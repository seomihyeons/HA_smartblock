# Reproduction Step 2 Execution Plan And Results

This Step 2 work stabilized minimal reproduction scripts and environment. Sasha/SAGE full benchmarks were not run.

## What Was Actually Executed

| Area | Executed | Output |
|---|---|---|
| Sasha dataset processing | Converted cached HF dataset to processed JSONL. | `ha_llm_control/reproductions/sasha/data/processed/sasha_train_processed.jsonl` |
| Sasha processed manifest | Wrote conversion metadata. | `ha_llm_control/reproductions/sasha/data/processed/processed_manifest.json` |
| Sasha offline evaluator | Evaluated stored `response` fields only. | `ha_llm_control/reproductions/sasha/evaluation/offline_baseline_summary.csv`, `offline_baseline_report.md`, `offline_baseline_candidates.jsonl` |
| Sasha provider/pipeline skeleton | Added adapter/call-counter and Fig.11 stage skeleton. | `ha_llm_control/reproductions/sasha/scripts/provider_adapter.py`, `pipeline_skeleton.py`, prompt files |
| SAGE dependency resolution | Installed only dependencies needed after import/runtime blockers were observed. | `docs/sage_dependency_resolution.md` |
| SAGE service check | Confirmed MongoDB reachable and Docker container running. | MongoDB 7.0.14, `docker-mongo-1` |
| SAGE minimal cases | Ran three single-case executions with `run_subset.py`. | `ha_llm_control/reproductions/sage/results/step2_minimal_cases/summary.md` |

## What Was Not Executed

| Area | Not executed |
|---|---|
| Sasha full benchmark | No full Sasha benchmark exists in this workspace and none was run. |
| Sasha zero-shot rerun | No OpenAI/Claude/Gemini/Grok calls were made for Sasha. |
| Sasha Fig.11 pipeline | Skeleton only; no Clarifying/Filtering/Planning/Feedback LLM calls were made. |
| SAGE full benchmark | `run_tests.sh` and the full 50-case suite were not run. |
| SAGE optional integrations | Google/Gmail/Calendar, weather-specific cases, and real-device SmartThings mode were not run. |
| Exact LLM call instrumentation | Not implemented yet; current counts are log-derived approximations. |

## Sasha Step 2 Results

| Metric | Value |
|---|---:|
| Processed rows | 120 |
| Response JSON parse success | 120 / 120 |
| `response.status = success` | 96 |
| `response.status = failure` | 23 |
| Missing/other status | 1 |
| `home_supports_goal = true` | 78 |
| `home_supports_goal = false` | 42 |
| False positive candidates | 19 |
| False negative candidates | 0 |
| Relevance candidates | 66 |

Notes:

- These are offline consistency checks over the stored dataset responses.
- False positive/negative and relevance rows are candidates for manual inspection, not final semantic errors.
- `Execution/API mapping` is explicitly not counted as an LLM call in the Sasha skeleton.

Sasha files added:

| File | Purpose |
|---|---|
| `ha_llm_control/reproductions/sasha/scripts/prepare_processed_dataset.py` | Converts the HF dataset into JSONL. |
| `ha_llm_control/reproductions/sasha/scripts/offline_evaluate.py` | Computes offline stored-response metrics. |
| `ha_llm_control/reproductions/sasha/scripts/provider_adapter.py` | Future provider adapter and call counter interface. |
| `ha_llm_control/reproductions/sasha/scripts/pipeline_skeleton.py` | Fig.11-style pipeline call-plan skeleton. |
| `ha_llm_control/reproductions/sasha/scripts/prompts/sasha_fig11/*.md` | Clarifying, Filtering, Planning, Feedback prompt skeletons. |
| `ha_llm_control/reproductions/sasha/outputs/fig11_pipeline_call_plan.json` | Dry-run skeleton call plan. |

## SAGE Dependency Resolution

| Finding | Resolution |
|---|---|
| `run_subset.py` initially blocked by missing `tyro`. | Installed `tyro==0.5.6`. |
| Runtime/import path needed `pandas`, `pyaml`, `tqdm`, `click`, and `nltk`. | Installed/pinned lightweight dependencies as blockers appeared. |
| `device_disambiguation.py` imports `open_clip` and `torch` at module load time. | Installed `torch==2.1.2` and `open-clip-torch`. |
| `MemoryBank` required HuggingFace embeddings and Chroma. | Installed `sentence-transformers` and `chromadb==0.4.8`. |
| Latest `sentence-transformers` pulled incompatible `transformers 5.x`. | Pinned `sentence-transformers==2.6.1`, `transformers==4.39.3`, `tokenizers==0.15.2`, `huggingface-hub==0.23.5`. |
| Offline config lacked required model caches. | Cached `sentence-transformers/all-MiniLM-L6-v2` and `laion/CLIP-ViT-B-32-laion2B-s34B-b79K`. |

Remaining `pip check` items:

| Item | Status |
|---|---|
| `pre-commit` | Missing; development dependency, not needed for minimal runs. |
| `seaborn` | Missing; plotting dependency, not needed for minimal runs. |

## SAGE Minimal Case Results

| Case | Result | Interpretation |
|---|---|---|
| `turn_on_bedside_light` | success | Environment, embeddings, Chroma, OpenCLIP, MongoDB, and OpenAI call path worked. |
| `check_freezer_temp` | failure | Behavioral/tool-planning failure: the agent queried `main/temperatureMeasurement/temperature` and got `None` instead of reporting freezer value `-17`. |
| `turn_on_tv` | success | The agent disambiguated by eventually turning on Samsung 8 Series (82), satisfying the assertion in this run. |

Result summary:

```text
ha_llm_control/reproductions/sage/results/step2_minimal_cases/summary.md
```

Trace directories:

| Case | Trace directory |
|---|---|
| `turn_on_bedside_light` | `ha_llm_control/reproductions/sage/source/subset_test/2026-07-01T14-53-48/turn_on_bedside_light` |
| `check_freezer_temp` | `ha_llm_control/reproductions/sage/source/subset_test/2026-07-01T14-55-38/check_freezer_temp` |
| `turn_on_tv` | `ha_llm_control/reproductions/sage/source/subset_test/2026-07-01T14-56-43/turn_on_tv` |

Each trace directory contains `experiment.log`, `viz.log`, `tools.pickle`, and `memory_snapshots/initial_snapshot.json`.

## LLM Call Counting

Current approximate counts from `experiment.log`:

| Case | Approx. `LLMChain` entries |
|---|---:|
| `turn_on_bedside_light` | 14 |
| `check_freezer_temp` | 7 |
| `turn_on_tv` | 17 |

These are not exact provider call counts. For exact counts, add a LangChain callback in `sage/utils/logging_utils.py:get_callback_handlers()` implementing `on_llm_start` and `on_llm_end`, then aggregate per-case records in `run_subset.py`.

## Next Step

| Priority | Task |
|---:|---|
| 1 | Add exact LLM call instrumentation before reporting call counts as metrics. |
| 2 | Add a compact SAGE result parser so pass/fail, trace path, and call counts are written automatically. |
| 3 | Manually inspect Sasha candidate rows before treating them as dataset errors. |
| 4 | Decide whether to rerun `check_freezer_temp` after constraining the planner to inspect the `freezer` component; do not mix that with baseline results. |
