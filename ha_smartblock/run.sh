#!/usr/bin/with-contenv bashio

cd /app

export PORT="${PORT:-8099}"
export HA_BASE_URL="${HA_BASE_URL:-http://supervisor/core/api}"
export HA_TOKEN="${HA_TOKEN:-${SUPERVISOR_TOKEN:-}}"

node server/addon_server.js
