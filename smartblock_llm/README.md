# SmartBlock-LLM runtime

This package is the public Python boundary for SmartBlock-LLM. It accepts a
bounded request from the Node server, asks a configured model to produce an
intent and plan, and validates that plan against live Home Assistant metadata.
It never receives Home Assistant credentials and never directly executes or
saves an automation.

## API contract

The Node adapter calls only these local endpoints:

- `GET /health`
- `GET /v1/providers`
- `POST /v1/assistant` for intent and plan generation
- `POST /v1/assistant/respond` for a factual response after host validation
- `POST /v1/retrieval/fastembed` for optional entity retrieval

The model may select an intent and plan. The Node/Home Assistant boundary owns
entity grounding, capability checks, user confirmation, execution, and all
user-visible success/failure outcomes.

## Provider adapter

No API key or provider SDK is included in this repository. Configure one
deployment-owned factory before running the API:

```text
SMARTBLOCK_LLM_CLIENT_FACTORY=your_package.provider:get_llm_client
LLM_PROVIDER=chatgpt
OPENAI_API_KEY=...
```

`get_llm_client(provider)` must return an object that implements:

```python
client.generate_text(prompt: str, system_prompt: str, max_tokens: int) -> str
```

The optional `client.model` or `client.model_name` value is displayed only as
model metadata. The factory, model SDK, `.env`, and credentials are deployment
concerns and intentionally remain outside this package.

## Run

```powershell
python -m pip install -r smartblock_llm/requirements.txt
python -m smartblock_llm.api_server
```

The service binds to `127.0.0.1:8792` by default. Existing local installations
can continue to use `python -m ha_llm_control.llm_assistant.api_server`; that
private compatibility entry point injects the local provider adapter and calls
this public package.
