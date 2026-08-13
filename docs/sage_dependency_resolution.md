# SAGE Dependency Resolution

This document records dependency work performed for Step 2 minimal SAGE execution. The full benchmark was not run.

## Starting Point

| Check | Result |
|---|---|
| Runner | `ha_llm_control/reproductions/sage/runners/run_subset.py` |
| Python | 3.10.1 in `ha_llm_control/reproductions/sage/.venv` |
| MongoDB | Reachable at `127.0.0.1:27017`, version 7.0.14 |
| Docker container | `docker-mongo-1`, port `27017` exposed |
| API keys | Existence checked only; values were not printed |

Initial missing packages included `tyro`, `pandas`, `pyaml`, `torch`, `open-clip-torch`, `sentence-transformers`, and `chromadb`.

## Import Path Findings

| Dependency | Why it is needed for the minimal cases |
|---|---|
| `tyro` | `sage/testing/test_runner.py` imports it at module load time. |
| `pandas` | Imported by baseline/logging paths and declared by SAGE package metadata. |
| `pyaml` | Declared by SAGE package metadata. |
| `tqdm` | Declared as `tqdm==4.65.0`; also used by ML package dependencies. |
| `click` | Required by `sage/retrieval/profiler.py`, reached through `MemoryBank`. |
| `nltk` | Required by `sage/smartthings/device_disambiguation.py`, reached through top-level SmartThings tool imports. |
| `torch` and `open-clip-torch` | `device_disambiguation.py` imports `torch` and `open_clip` at module load time. |
| `sentence-transformers` | `MemoryBank.create_indexes()` calls LangChain `HuggingFaceEmbeddings`. |
| `chromadb` | `sage/retrieval/vectordb.py` uses LangChain `Chroma` for user memory indexes. |

## Installed Packages

| Step | Packages | Result |
|---|---|---|
| Lightweight first pass | `tyro==0.5.6`, `pandas==1.5.3`, `pyaml`, `tqdm==4.65.0` | Installed. |
| Next import blocker | `click==8.1.7` | Installed, later upgraded transitively to `click==8.4.2`. |
| Device disambiguation import | `nltk==3.8.1` | Installed. |
| Confirmed heavy import blocker | `torch==2.1.2`, `open-clip-torch` | Installed after `open_clip` import failure. |
| Vector/memory runtime | `sentence-transformers`, `chromadb==0.4.8` | Initial latest install failed at runtime due `transformers 5.x` / `torch 2.1.2` incompatibility. |
| Compatibility pin | `sentence-transformers==2.6.1`, `transformers==4.39.3`, `tokenizers==0.15.2`, `huggingface-hub==0.23.5` | Installed and used for successful case execution. |

`pip check` after resolution reports only:

| Remaining item | Interpretation |
|---|---|
| `pre-commit` missing | Development/tooling dependency, not needed for minimal case execution. |
| `seaborn` missing | Plotting/reporting dependency, not needed for minimal case execution. |

## Model Cache Resolution

`config.ps1` enables Hugging Face/Transformers offline mode. The first real case attempt therefore failed because `sentence-transformers/all-MiniLM-L6-v2` was not yet cached.

The following model assets were cached under `ha_llm_control/reproductions/sage/hf_cache` before rerunning cases:

| Asset | Purpose |
|---|---|
| `sentence-transformers/all-MiniLM-L6-v2` | User memory embeddings for Chroma indexes. |
| `laion/CLIP-ViT-B-32-laion2B-s34B-b79K` | OpenCLIP weights used by `DeviceDisambiguationTool`. |

Warnings observed:

| Warning | Impact |
|---|---|
| Hugging Face symlink warning on Windows | Cache still works, but may use more disk space. |
| `TRANSFORMERS_CACHE` deprecation warning | Non-blocking; future cleanup should prefer `HF_HOME`. |
| Chroma telemetry warning, `capture() takes 1 positional argument but 3 were given` | Non-blocking for the minimal cases. |
| Google API Python 3.10.1 future support warning | Non-blocking now; should be tracked for long-term reproducibility. |
| LangChain root import deprecation warnings | Non-blocking now; indicates upstream code is dated. |

## Current State

`run_subset.py --help` now succeeds. The three requested minimal cases were then run one process at a time. This remains a minimal subset run, not the full SAGE benchmark.
