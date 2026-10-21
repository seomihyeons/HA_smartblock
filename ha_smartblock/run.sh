#!/usr/bin/with-contenv bashio
set -euo pipefail
cd /app
export PORT="${PORT:-8099}"
export HA_BASE_URL="${HA_BASE_URL:-http://supervisor/core/api}"
export HA_TOKEN="${HA_TOKEN:-${SUPERVISOR_TOKEN:-}}"
export ANALYZER_HOST=127.0.0.1
export ANALYZER_PORT=8787
export LLM_ASSISTANT_BACKEND="${LLM_ASSISTANT_BACKEND:-provider_neutral}"
export LLM_ASSISTANT_API_URL=http://127.0.0.1:8792
export LLM_NODE_API_URL=http://127.0.0.1:8787
export LLM_PROVIDER="${LLM_PROVIDER:-ollama}"
export PYTHON="${PYTHON:-python3}"
"$PYTHON" -B -m ha_llm_control.llm_assistant.api_server &
python_pid=$!
node server/analyze_server.js &
assistant_pid=$!
node server/addon_server.js &
addon_pid=$!
trap 'kill "$python_pid" "$assistant_pid" "$addon_pid" 2>/dev/null || true' EXIT INT TERM
wait -n "$python_pid" "$assistant_pid" "$addon_pid"
