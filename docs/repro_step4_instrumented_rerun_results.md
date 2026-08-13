# Reproduction Step 4 Instrumented Rerun Results

Step 4 kept the Step 3 instrumentation in place and did not change SAGE benchmark logic, planner prompts, or tool selection logic.

## Scope

| Item | Status |
|---|---|
| Full benchmark expansion | Not run |
| Planner prompt changes | Not changed |
| Tool selection logic changes | Not changed |
| Benchmark assertions | Not changed |
| SAGE minimal cases | Three requested cases rerun once each as independent processes |
| Sasha provider calls | Not run |

## OpenAI Quota And Model Check

The OpenAI key was present in the environment, but the key value was not printed.

`run_subset.py` accepts `--model-name` and passes it into `TestDemoConfig`, which constructs `GPTConfig(model_name=...)`. Therefore changing the OpenAI model name is possible without editing planner or benchmark logic.

Probe script:

```text
ha_llm_control/reproductions/sage/runners/probe_openai_models.py
```

Probe result:

| Model | Status | Error type |
|---|---|---|
| `gpt-4` | error | `RateLimitError` |
| `gpt-4o-mini` | error | `RateLimitError` |
| `gpt-4.1-mini` | error | `RateLimitError` |
| `gpt-3.5-turbo` | error | `RateLimitError` |
| `gpt-4o` | error | `RateLimitError` |
| `gpt-4.1-nano` | error | `RateLimitError` |
| `gpt-5-mini` | error | `RateLimitError` |
| `gpt-5-nano` | error | `RateLimitError` |

Interpretation: no tested OpenAI model had usable quota for this key. This looks like an account/key quota or billing issue, not a SAGE model-name configuration issue.

`ANTHROPIC_API_KEY` was present, but Claude was not used because this rerun was requested as an OpenAI quota/model check and switching provider would change the reproduction condition.

## SAGE Step 4 Rerun

Because no OpenAI model passed the smoke check, the three minimal cases were still rerun once each with `gpt-4o-mini` as the smallest tested candidate model. All three runs failed at the first provider call with quota 429. They did not reach SmartThings tool selection.

Summary file:

```text
ha_llm_control/reproductions/sage/results/step4_instrumented_cases/summary.csv
```

| Case | Model | Result | LLM calls | LLM ends | LLM errors | Tool calls | Component/capability sequence | Trace directory |
|---|---|---|---:|---:|---:|---:|---|---|
| `turn_on_bedside_light` | `gpt-4o-mini` | failure, quota 429 | 1 | 0 | 1 | 0 | none; provider failed before tool selection | `ha_llm_control/reproductions/sage/source/subset_test/2026-07-01T15-55-29/turn_on_bedside_light` |
| `turn_on_tv` | `gpt-4o-mini` | failure, quota 429 | 1 | 0 | 1 | 0 | none; provider failed before tool selection | `ha_llm_control/reproductions/sage/source/subset_test/2026-07-01T15-57-07/turn_on_tv` |
| `check_freezer_temp` | `gpt-4o-mini` | failure, quota 429 | 1 | 0 | 1 | 0 | none; provider failed before tool selection | `ha_llm_control/reproductions/sage/source/subset_test/2026-07-01T15-58-40/check_freezer_temp` |

## Per-Case Outputs

| Case | Manifest | LLM calls | Tool calls |
|---|---|---|---|
| `turn_on_bedside_light` | `ha_llm_control/reproductions/sage/results/step4_instrumented_cases/turn_on_bedside_light/run_manifest.json` | `ha_llm_control/reproductions/sage/source/subset_test/2026-07-01T15-55-29/turn_on_bedside_light/llm_calls.jsonl` | `ha_llm_control/reproductions/sage/source/subset_test/2026-07-01T15-55-29/turn_on_bedside_light/tool_calls.jsonl` |
| `turn_on_tv` | `ha_llm_control/reproductions/sage/results/step4_instrumented_cases/turn_on_tv/run_manifest.json` | `ha_llm_control/reproductions/sage/source/subset_test/2026-07-01T15-57-07/turn_on_tv/llm_calls.jsonl` | `ha_llm_control/reproductions/sage/source/subset_test/2026-07-01T15-57-07/turn_on_tv/tool_calls.jsonl` |
| `check_freezer_temp` | `ha_llm_control/reproductions/sage/results/step4_instrumented_cases/check_freezer_temp/run_manifest.json` | `ha_llm_control/reproductions/sage/source/subset_test/2026-07-01T15-58-40/check_freezer_temp/llm_calls.jsonl` | `ha_llm_control/reproductions/sage/source/subset_test/2026-07-01T15-58-40/check_freezer_temp/tool_calls.jsonl` |

The `tool_calls.jsonl` files exist but are empty because no tool callback fired before the provider quota error.

## Check Freezer Temp Selection

For this Step 4 run, `check_freezer_temp` selected no device/component/capability/attribute:

| Field | Value |
|---|---|
| Device | none |
| Component | none |
| Capability | none |
| Attribute | none |
| Reason | first `gpt-4o-mini` LLM call failed with OpenAI quota 429 before the agent produced any tool action |

Historical Step 2 still contains the earlier behavioral failure sequence, but it is not a Step 4 rerun result.

## Sasha Manual Review Template

Created:

```text
ha_llm_control/reproductions/sasha/evaluation/manual_review_template.md
```

The template restates the 10 representative rows from `candidate_review_sample.md` and provides one manual label slot per row:

| Manual label | Meaning |
|---|---|
| `진짜 오류` | Stored response likely contradicts the dataset goal/capability |
| `라벨 애매함` | Dataset label, taxonomy, or expected behavior is underspecified |
| `주관적 해석 가능` | Command meaning depends on preference, context, or interpretation |

## Remaining Blocker

| Blocker | Status | Required action |
|---|---|---|
| OpenAI quota | unresolved | Manual billing/quota/API-key fix is required before SAGE can reach tool selection with an OpenAI model |

After the OpenAI quota issue is fixed, rerun the same three cases with the same Step 4 instrumentation output path or a fresh `step4_rerun_after_quota_fix` path to avoid mixing blocked and successful runs.
