# Reproduction Step 1 Environment Report

This report covers only the minimal environment preparation for first reproduction runs. Full Sasha or SAGE benchmarks were not executed.

## Sasha Dataset Access

| Check | Result | Evidence / Note |
|---|---|---|
| Reproduction folders | Ready | Created `ha_llm_control/reproductions/sasha/data/raw`, `data/processed`, `outputs`, `evaluation`, and `scripts`. |
| Python environment | Ready | Created `ha_llm_control/reproductions/sasha/.venv` with Python 3.10.1. |
| `datasets` install | Ready | Installed in the Sasha venv after an initial timeout. |
| Dataset load | Ready | `load_dataset("ThoughtfulThings/sasha_smart_home_reasoning")` succeeded. |
| Row count | Ready | `train`: 120 rows. |
| Required fields | Ready | `command`, `prompt`, `response`, `devices`, `sensors`, `relevant_device_types`, and `home_supports_goal` are present. |
| First 3 row field validation | Ready | Core fields were inspected; JSON-like fields parse for `response`, `devices`, `sensors`, and `relevant_device_types`. |
| Raw manifest | Ready | `ha_llm_control/reproductions/sasha/data/raw/dataset_manifest.json`. |
| Schema doc | Ready | `docs/sasha_dataset_schema.md`. |
| Cache issue | Resolved | Deep raw-data cache path failed on Windows lock-file path length; short `hf_cache/datasets` path works. |

## SAGE Environment Reconstruction

| Check | Result | Evidence / Note |
|---|---|---|
| Source location | Ready | Using existing `ha_llm_control/reproductions/sage/source`. |
| Python version | Ready | Local SAGE venv uses Python 3.10.1, matching upstream `python_requires >=3.10,<3.11`. |
| Venv creation | Ready | Created `ha_llm_control/reproductions/sage/.venv`. |
| Editable package install | Ready | `pip install -e ha_llm_control/reproductions/sage/source --no-deps` succeeded. |
| Requirements install feasibility | Partial | `pip --dry-run` is unavailable in bundled pip 21.2.4. Full requirements were not installed. Minimal import dependencies were installed only as needed. |
| Docker CLI | Partial | Docker CLI and Compose exist, but Docker prints an access warning for `%USERPROFILE%\.docker\config.json`. |
| Docker daemon / MongoDB | Ready | Docker Desktop was started; container `docker-mongo-1` is running on port 27017. MongoDB smoke check returned version 7.0.14. |
| `fake_requests.py` import | Ready | Import succeeds after MongoDB is reachable and `requests`/`pymongo` are installed. |
| `sage/testing/testcases.py` import | Ready for smoke import | Import succeeds with dummy API-key environment variables. No real API key values were printed or used. |
| Minimal target cases registered | Ready | `turn_on_bedside_light`, `check_freezer_temp`, and `turn_on_tv` are present in registered SAGE test cases. |
| Local subset runner | Found, blocked by deps | Existing runner found at `ha_llm_control/reproductions/sage/runners/run_subset.py`. Runner import currently fails because `tyro` is not installed. This step did not execute the cases. |

## Failed Or Partial Dependency Work

| Item | Status | Detail |
|---|---|---|
| SAGE full requirements | Not run | Avoided full benchmark-scale setup. Heavy packages such as `torch`, `open-clip-torch`, `sentence-transformers`, and `chromadb` were not installed in this step. |
| `pip install --dry-run -r requirements.txt` | Failed | SAGE venv pip is 21.2.4 and does not support `--dry-run`. |
| SAGE declared package deps | Partial | Editable install reported missing or mismatched declared deps: `pandas==1.5.3`, `pre-commit`, `pyaml`, `seaborn==0.12.2`, and `tqdm==4.65.0`. |
| `Requests==2.28.1` pin | Partial | Minimal installs ended with a newer `requests` version than the upstream pin. Resolve before controlled SAGE benchmark runs. |
| Runner/runtime packages | Missing | Current venv is missing `tyro`, `torch`, `open-clip-torch`, `sentence-transformers`, `chromadb`, `pandas`, `pyaml`, and `seaborn`. These are needed before actually running `run_subset.py`. |
| Import warnings | Manual review | Import emitted Python 3.10.1 support-warning text from Google API dependencies and LangChain deprecation warnings. |

## API Key Availability

| Location | Keys checked | Result |
|---|---|---|
| Root `.env` | Home Assistant connection keys | Present/non-empty for the checked HA connection variables. Values were not printed. |
| `ha_llm_control/llm_api/.env` | OpenAI, Claude/Anthropic, Gemini/Google, Grok/xAI provider keys and model/provider settings | Present/non-empty for the checked variables. Values were not printed. |
| Current process environment | LLM-related variables | Existence only was checked. Values were not printed. |

For the `testcases.py` import smoke test, dummy API-key variables were injected only to satisfy import-time environment access. Actual SAGE execution should use the real configured environment without echoing secrets.

## Next Minimal Cases

| Case | Registered | Full benchmark? | Expected command | Current run status |
|---|---:|---:|---|---|
| `turn_on_bedside_light` | Yes | No | `ha_llm_control\reproductions\sage\.venv\Scripts\python.exe ha_llm_control\reproductions\sage\runners\run_subset.py --case turn_on_bedside_light` | `manual_required`: install missing runner/runtime deps first. |
| `check_freezer_temp` | Yes | No | `ha_llm_control\reproductions\sage\.venv\Scripts\python.exe ha_llm_control\reproductions\sage\runners\run_subset.py --case check_freezer_temp` | `manual_required`: install missing runner/runtime deps first. |
| `turn_on_tv` | Yes | No | `ha_llm_control\reproductions\sage\.venv\Scripts\python.exe ha_llm_control\reproductions\sage\runners\run_subset.py --case turn_on_tv` | `manual_required`: install missing runner/runtime deps first. |

Expected PowerShell setup before a single-case run:

```powershell
. .\ha_llm_control\reproductions\sage\config.ps1
```

Expected single-case commands after resolving missing runtime dependencies:

```powershell
ha_llm_control\reproductions\sage\.venv\Scripts\python.exe ha_llm_control\reproductions\sage\runners\run_subset.py --case turn_on_bedside_light
ha_llm_control\reproductions\sage\.venv\Scripts\python.exe ha_llm_control\reproductions\sage\runners\run_subset.py --case check_freezer_temp
ha_llm_control\reproductions\sage\.venv\Scripts\python.exe ha_llm_control\reproductions\sage\runners\run_subset.py --case turn_on_tv
```

## TODO

| Priority | Task | Status |
|---:|---|---|
| 1 | Install or normalize the missing SAGE runtime dependencies needed by `run_subset.py`. | `manual_required` |
| 2 | Use existing `run_subset.py` for the first three single-case SAGE runs after dependencies are resolved. | Ready after deps |
| 3 | Keep Docker Desktop and MongoDB running for the first SAGE minimal case execution. | Ready |
| 4 | Build Sasha processed/evaluation scripts from the now-confirmed schema. | Ready next |
| 5 | Run only the three named SAGE cases first, then decide whether a broader benchmark is justified. | Ready next |
