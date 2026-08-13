# Sasha/SAGE Reproduction Readiness Report

Generated: 2026-07-01 KST

Scope: read-only readiness inspection plus this report file. No benchmark execution, no repository clone, no package installation, and no API call was performed for this check. API key values were not printed.

## Public Sources Checked

| Target | Public source | Observed facts |
| --- | --- | --- |
| Sasha dataset | https://huggingface.co/datasets/ThoughtfulThings/sasha_smart_home_reasoning | Public Hugging Face dataset page exists, tagged `llm`, `smarthome`, `reasoning`, license shown as `mit`, split `train`, preview exposes the requested fields. The full dataset viewer reports an availability error and only preview rows are shown. |
| SAGE code | https://github.com/SAIC-MONTREAL/SAGE | Public repository exists for “Smart home Agent with Grounded Execution.” README states Python 3.10, MongoDB Docker, trigger server, SmartThings setup, demo, and 50-testcase benchmark via `sage/testing/test_runner.py`. |
| SAGE license | https://raw.githubusercontent.com/SAIC-MONTREAL/SAGE/main/LICENSE | License text is Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International. |

## 1. Current Folder And Material Status

| Item | Local status | Evidence path | Readiness interpretation |
| --- | --- | --- | --- |
| Main HA-SmartBlock project | Present | project root `src/`, `test/`, `ha_smartblock/` | Existing project remains separate from Sasha/SAGE reproduction work. |
| LLM-control research area | Present | `ha_llm_control/` | This is the right local area for Sasha/SAGE reproduction work. |
| Sasha local folder | Present, lightweight only | `ha_llm_control/reproductions/sasha/` | Contains dataset inspection notes/script, but no local raw Hugging Face dataset copy. |
| SAGE local folder | Present | `ha_llm_control/reproductions/sage/` | SAGE reproduction area already exists; no immediate need to clone into `third_party/SAGE`. |
| SAGE source clone | Present | `ha_llm_control/reproductions/sage/source/` | Looks like a local copy of `SAIC-MONTREAL/SAGE`, with README, LICENSE, source package, benchmark files, data, Docker config, and external API docs. |
| Sasha paper PDF | Present | `security/paper/Sasha.pdf` | Local paper copy exists. |
| SAGE paper PDF | Present | `security/paper/SAGE (중요).pdf` | Local paper copy exists. |
| Other related paper | Present | `security/paper/HomeBench.pdf` | Adjacent benchmark paper available. |
| Existing reproduction notes | Present | `ha_llm_control/reproductions/reproduction_feasibility.md`, `link_inventory.md`, `sage/summary.md`, `sage/README.md`, `sasha/dataset_notes.md` | Existing analysis is useful; some SAGE environment notes describe past state and must be rechecked before execution. |
| Sasha raw dataset storage | Not found | expected under `ha_llm_control/reproductions/sasha/data/` | Needs creation/download later if running Sasha dataset evaluation. |
| SAGE memory/sample data | Present | `ha_llm_control/reproductions/sage/source/data/memory_data/` | `large_memory_bank.json`, `memory_bank.json`, `manual_memories.json` exist. |
| SAGE fake SmartThings test environment | Present | `ha_llm_control/reproductions/sage/source/sage/testing/` | `fake_requests.py`, `device_state0.pkl`, `device_state_4383.pkl`, `testcases.py`, `testing_utils.py`, `tv_guide.csv` exist. |
| SAGE image/demo resources | Partially present | `ha_llm_control/reproductions/sage/source/sage/testing/assets/images/`, `source/assets/`, `source/bin/demo.py` | Device disambiguation images and demo script exist; no separate demo video file was found locally. |
| SAGE previous result artifacts | Present | `ha_llm_control/reproductions/sage/results/` | Existing subset results include `turn_on_tv`, `turn_on_bedside_light`, and `check_freezer_temp`. |
| SAGE active virtualenv/cache/logs | Not present now | `.venv`, `hf_cache`, `logs` under `ha_llm_control/reproductions/sage/` | Past notes mention these, but current folder does not contain them. Re-execution requires environment/cache regeneration. |
| General docs folder | Created for this report | `docs/repro_readiness_report.md` | Documentation location now exists. |

## Existing API/Environment Key Presence

Values were not printed. This is only a name/non-empty presence check.

| Location | Keys or variables observed | Status |
| --- | --- | --- |
| Root `.env` | `HA_BASE_URL`, `HA_IP`, `HA_PORT`, `HA_TOKEN` | Present and non-empty. |
| `ha_llm_control/llm_api/.env` | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `XAI_API_KEY`, plus model/provider variables | Present and non-empty by local `.env` check. |
| Current process environment | `claude` | Present; non-standard variable name, not enough by itself for provider SDKs. |
| SAGE PowerShell config | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENWEATHERMAP_API_KEY`, `MONGODB_SERVER_URL`, `SMARTHOME_ROOT`, `TRIGGER_SERVER_URL`, Hugging Face cache/offline variables | Config variables are referenced in `ha_llm_control/reproductions/sage/config.ps1`. |
| SAGE upstream shell config | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `HUGGINGFACEHUB_API_TOKEN`, `OPENWEATHERMAP_API_KEY`, `SMARTTHINGS_API_TOKEN`, `MONGODB_SERVER_URL`, `SMARTHOME_ROOT`, `TRIGGER_SERVER_URL` | Upstream expected variables are listed in `source/bin/config.sh`. |

## 2. Sasha Reproduction Readiness

| Check | Status | Details |
| --- | --- | --- |
| Public dataset existence | Available | Hugging Face page exists at `ThoughtfulThings/sasha_smart_home_reasoning`. |
| Local dataset copy | Missing | No local `data/raw` or parquet copy found under `ha_llm_control/reproductions/sasha/`. |
| Existing local analysis | Present | `dataset_notes.md` records prior inspection: 120 rows, `train` split, dataset file `data/train-00000-of-00001.parquet`, model field `gpt-4`. Current check did not re-download the dataset. |
| Requested fields visible in public preview | Available | `command`, `prompt`, `response`, `devices`, `sensors`, `relevant_device_types`, and `home_supports_goal` are visible in the Hugging Face preview schema. |
| Other visible fields | Available | `id`, `home`, `goal_type`, `goal_category`, `temperature`, `time_elapsed`, `usage`, `model`. |
| Full dataset viewer | Partially unavailable | Hugging Face page states the full dataset viewer is unavailable and only preview rows are shown. |
| Official executable Sasha system code | Not found locally | Existing notes also say official executable Sasha code was not found. |
| Realistic reproduction type | Dataset/pipeline reconstruction | Realistic target is zero-shot or pipeline reimplementation using the public prompt/context/response records, not full original Sasha system reproduction. |
| Evaluation feasibility | Feasible with caveats | Can compare new LLM outputs to stored `response` JSON structure and `home_supports_goal`, but exact paper/user-study reproduction is not realistic from public dataset alone. |

Recommended Sasha folder structure if continuing:

| Folder | Purpose |
| --- | --- |
| `ha_llm_control/reproductions/sasha/data/raw/` | Hugging Face parquet/JSONL cache or exported dataset. |
| `ha_llm_control/reproductions/sasha/data/processed/` | Parsed rows with decoded `devices`, `sensors`, `response`, and normalized target labels. |
| `ha_llm_control/reproductions/sasha/prompts/` | Reconstructed zero-shot prompt templates and provider-specific wrappers. |
| `ha_llm_control/reproductions/sasha/outputs/{provider}/{run_id}/` | LLM outputs without overwriting raw data. |
| `ha_llm_control/reproductions/sasha/evaluation/{run_id}/` | JSON/CSV metrics, parsing failures, agreement with stored response/home support label. |
| `ha_llm_control/reproductions/sasha/scripts/` | Future loaders/evaluators; current `inspect_dataset.py` can be moved here later if desired. |

## 3. SAGE Reproduction Readiness

| Check | Status | Details |
| --- | --- | --- |
| Public repo existence | Available | `SAIC-MONTREAL/SAGE` is public. |
| Local clone/source | Present | `ha_llm_control/reproductions/sage/source/` contains README, LICENSE, `requirements.txt`, `sage/`, `baselines/`, `data/`, `docker/`, `external_api_docs/`, and benchmark resources. |
| Need `third_party/SAGE`? | Not immediately | Existing `ha_llm_control/reproductions/sage/source` is sufficient for local reproduction. Use `third_party/SAGE` only if a clean upstream mirror is needed for provenance. |
| `sage/testing/testcases.py` | Present | Local file length about 70 KB; upstream README says benchmark testcases are there. |
| Benchmark runner | Present | `sage/testing/test_runner.py` exists. |
| Fake SmartThings environment | Present | `fake_requests.py` and `testing_utils.py` exist and use in-memory/fake request handling with device-state mutation. |
| Device state data | Present | `device_state0.pkl`, `device_state_4383.pkl` exist under `sage/testing/`. |
| Memory/sample data | Present | `data/memory_data/large_memory_bank.json`, `memory_bank.json`, `manual_memories.json`. |
| SmartThings external API docs | Present | `external_api_docs/cached_test_docmanager.json`, `smartthings_autodocs.json`, `smartthings_capabilities.json`. |
| Demo/resource files | Present | `bin/demo.py`, `sage/testing/assets/images`, `source/assets/icons`, `source/assets/transparent_icons`. |
| MongoDB support | Present as config | `source/docker/docker-compose.yml` exists; current Docker state was not checked in this read-only pass. |
| Active Python venv | Missing now | `ha_llm_control/reproductions/sage/.venv` is currently absent. |
| Hugging Face/model cache | Missing now | `ha_llm_control/reproductions/sage/hf_cache` is currently absent. |
| Existing subset results | Present | `sage/results/sage_gpt4/summary.json` shows prior subset: `turn_on_tv` failure, `turn_on_bedside_light` success, `check_freezer_temp` success. |
| Full paper reproduction readiness | Not ready | Requires environment rebuild, credentials, model/version choices, optional Google/weather setup, and repeatability policy. |
| Minimal subset reproduction readiness | Likely feasible after environment rebuild | Existing source/data/results indicate this has worked before, but current venv/cache/log folders are absent. |

Recommended SAGE folder policy:

| Option | Recommendation |
| --- | --- |
| Continue with existing source | Recommended for this project: use `ha_llm_control/reproductions/sage/source` as the local SAGE source copy. |
| Add `third_party/SAGE` | Optional only if you want a clean immutable upstream mirror separate from modified reproduction wrappers. |
| Store new run outputs | Use `ha_llm_control/reproductions/sage/results/{run_id}/` and never overwrite prior `sage_gpt4` results. |
| Store environment notes | Keep `reproduction_environment.md`, `requirements.lock.txt`, and a future `run_manifest.json` per run. |

## 4. Expected Install/Run Commands

These are expected commands for later execution. They were not run in this readiness pass.

| Target | Command | Purpose |
| --- | --- | --- |
| Sasha inspect preview | `python ha_llm_control\reproductions\sasha\inspect_dataset.py --limit 20` | Inspect Hugging Face first rows without LLM calls. Requires network. |
| Sasha full dataset load | `python -c "from datasets import load_dataset; ds=load_dataset('ThoughtfulThings/sasha_smart_home_reasoning')"` | Later full dataset access check. Requires `datasets` package and network/cache. |
| SAGE PowerShell env | `. ha_llm_control\reproductions\sage\config.ps1` | Set `SMARTHOME_ROOT`, MongoDB URL, provider keys, cache/offline variables. |
| SAGE Python env creation | `py -3.10 -m venv ha_llm_control\reproductions\sage\.venv` | Recreate missing Python 3.10 virtualenv. |
| SAGE install source | `ha_llm_control\reproductions\sage\.venv\Scripts\python.exe -m pip install -e ha_llm_control\reproductions\sage\source` | Install local SAGE package in editable mode. |
| SAGE install requirements | `ha_llm_control\reproductions\sage\.venv\Scripts\python.exe -m pip install -r ha_llm_control\reproductions\sage\source\requirements.txt` | Install upstream requirements. |
| SAGE MongoDB | `cd ha_llm_control\reproductions\sage\source\docker` then `docker compose up -d` | Start MongoDB service. |
| SAGE trigger server | `ha_llm_control\reproductions\sage\.venv\Scripts\python.exe ha_llm_control\reproductions\sage\source\sage\testing\run_server.py` | Start persistent-condition trigger server. |
| SAGE full benchmark | `ha_llm_control\reproductions\sage\.venv\Scripts\python.exe ha_llm_control\reproductions\sage\source\sage\testing\test_runner.py` | Run upstream benchmark after environment/credentials are ready. |
| SAGE local subset wrapper | `ha_llm_control\reproductions\sage\.venv\Scripts\python.exe ha_llm_control\reproductions\sage\runners\run_subset.py --case turn_on_bedside_light` | Safer Windows single-case run, based on existing local wrapper. |

## 5. License And Caution Notes

| Item | Status | Caution |
| --- | --- | --- |
| Sasha dataset | Hugging Face page shows MIT | Dataset use looks permissive, but still cite the dataset and paper. |
| SAGE source/data | CC BY-NC-ND 4.0 per local and upstream LICENSE | NonCommercial and NoDerivatives restrictions are important. Be careful with redistribution, modified copies, and derived artifacts. |
| SAGE external service use | Requires provider/API credentials depending on test | OpenAI/Anthropic/Hugging Face, OpenWeatherMap, Google Gmail/Calendar, and SmartThings tokens may be needed. |
| SAGE model drift | High risk | Paper results used older model/API conditions; current API model behavior may differ. |
| Sasha model drift | High risk | Stored dataset responses are from `gpt-4`; current model reruns may not match exactly. |
| API key handling | Sensitive | Do not commit `.env`, logs with prompts containing secrets, or raw provider traces. |
| Local previous SAGE results | Useful but not current proof | Existing results show prior minimal feasibility, but current venv/cache are absent and must be rebuilt before new execution. |

## 6. Next-Step TODO

| Priority | Task | Owner decision needed? | Notes |
| --- | --- | --- | --- |
| P0 | Decide reproduction scope: Sasha dataset-level only, SAGE minimal subset first | Yes | Avoid claiming full system/paper reproduction before setup and reruns. |
| P0 | Preserve current local SAGE source provenance | Yes | Either keep `ha_llm_control/reproductions/sage/source` as canonical local copy or create a clean `third_party/SAGE` mirror later. |
| P1 | Create Sasha data folders | No | `data/raw`, `data/processed`, `outputs`, `evaluation` under `ha_llm_control/reproductions/sasha/`. |
| P1 | Download/cache Sasha dataset metadata | Yes, before network use | Use Hugging Face dataset loader or first-rows API; store schema and row-count manifest. |
| P1 | Rebuild SAGE Python 3.10 environment | Yes, before installs | Current `.venv` is absent; use lock notes and `requirements.txt`. |
| P1 | Check Docker/MongoDB readiness | Yes, before SAGE run | No Docker command was run in this pass. |
| P1 | Decide SAGE first subset cases | Yes | Existing low-dependency candidates: `turn_on_bedside_light`, `check_freezer_temp`, `turn_on_tv`. |
| P2 | Define Sasha evaluation metrics | Yes | Suggested: JSON parse rate, status agreement, device selection overlap, field-level exact/semantic match. |
| P2 | Define SAGE run manifest format | No | Capture commit/source path, env variables present, model/provider, case name, command, result artifact paths. |
| P2 | Add no-secret logging rule | No | Redact API keys and avoid committing provider trace logs with secrets. |
| P3 | Full SAGE benchmark planning | Yes | Requires optional Google/weather/SmartThings decisions and expected cost/runtime estimate. |

## Bottom Line

Sasha is realistic as a public dataset and zero-shot/pipeline reconstruction target. The requested fields are visible in the public Hugging Face preview, and local notes/scripts already exist, but the raw dataset is not stored locally.

SAGE is more complete locally: source code, `testcases.py`, fake SmartThings environment, device state files, memory/sample data, images, external API docs, and prior subset results are present. It does not need an immediate `third_party/SAGE` clone. The main gap is that the active execution environment and caches are currently absent, so actual reruns require environment reconstruction before benchmark execution.
