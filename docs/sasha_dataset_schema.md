# Sasha Dataset Schema Check

This note records the first-pass, read-only dataset access check for `ThoughtfulThings/sasha_smart_home_reasoning`.

## Load Result

| Item | Result |
|---|---|
| Loader | `datasets.load_dataset("ThoughtfulThings/sasha_smart_home_reasoning")` |
| Local environment | `ha_llm_control/reproductions/sasha/.venv` |
| Cache used | `hf_cache/datasets` |
| Splits | `train` |
| Train rows | `120` |
| Manifest | `ha_llm_control/reproductions/sasha/data/raw/dataset_manifest.json` |

The first load attempt with a deep cache path under `ha_llm_control/reproductions/sasha/data/raw/hf_cache` failed on Windows because the Hugging Face lock-file path became too long. The successful check used the shorter repository-root cache path `hf_cache/datasets`.

## Schema

| Field | Dataset type |
|---|---|
| `id` | `string` |
| `home` | `string` |
| `command` | `string` |
| `goal_type` | `string` |
| `goal_category` | `string` |
| `prompt` | `string` |
| `temperature` | `float64` |
| `response` | `string` |
| `time_elapsed` | `float64` |
| `usage` | `string` |
| `model` | `string` |
| `devices` | `string` |
| `sensors` | `string` |
| `relevant_device_types` | `string` |
| `home_supports_goal` | `bool` |

## Required Field Availability

| Required field | Present | First 3 row check |
|---|---:|---|
| `command` | Yes | Plain text command. First three rows use `make it less chilly in here`. |
| `prompt` | Yes | Plain text prompt containing command, devices, sensors, and response instructions. |
| `response` | Yes | JSON-parseable string. Row 0 has `status`; rows 1 and 2 have `status`, `devices`, and `explanation`. |
| `devices` | Yes | JSON-parseable string. Top-level rooms include `entry`, `bathroom`, `livingroom`, `hall`, `diningroom`, `kitchen`, and `bedroom`. |
| `sensors` | Yes | JSON-parseable string. Top-level entries include `user`, room names, and `global`. |
| `relevant_device_types` | Yes | JSON-parseable list. First three rows contain `climate control`. |
| `home_supports_goal` | Yes | Boolean. First three values are `false`, `true`, `true`. |

## Reproduction Implication

The dataset is accessible enough for a zero-shot or pipeline-reconstruction evaluation. The fields needed to reconstruct prompts, inspect device/sensor context, compare target responses, and separate supported versus unsupported homes are available.

No Sasha benchmark or LLM inference was run in this step.
