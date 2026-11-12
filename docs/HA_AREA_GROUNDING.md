# Home Assistant Area Registry Grounding (LLM)

## Purpose

The LLM's existing EntityCard shape already supports `area`, but Home
Assistant's `GET /api/states` does not normally include area assignments.
The read-only registry client enriches live states with authoritative HA
Entity/Device/Area metadata **before** Entity Retrieval and LLM planning.

## Read path

- REST `GET /api/states`: live device states (unchanged)
- REST `GET /api/services`: capability metadata (existing cache)
- Single authenticated `/api/websocket` connection; concurrently requests:
  `config/area_registry/list`, `config/device_registry/list`,
  `config/entity_registry/list`
- Join Entity ID -> Device ID -> Area ID with Entity area override priority.
- Only the resulting room name is included in `EntityCard.area`.
  API credentials and complete registry records are never passed to the LLM.

This is **not yet Tool Calling**. It improves the pre-existing one-call planner
and will serve the future selective read-only tool orchestrator.

## Safety and latency

Area metadata is cached for 60 seconds by default; device states are not.
Concurrent requests share a single in-flight registry fetch. On WebSocket
failure, the area cache returns null for 10 seconds and normal planning continues,
without inventing room names.

Optional configuration:

```dotenv
HA_AREA_REGISTRY_CACHE_TTL_MS=60000
HA_AREA_REGISTRY_TIMEOUT_MS=3000
```

## Local validation

1. Create six areas in isolated Home Assistant: Bedroom, Living Room,
   Bathroom, Kitchen, Entrance, Hallway.
2. Confirm virtual devices are correctly assigned. MQTT `suggested_area`
   does not overwrite existing user-selected areas.
3. Configure a local HA token and run:
   ```bash
   HA_BASE_URL=http://127.0.0.1:8124 HA_TOKEN=... node scripts/check-ha-areas.mjs
   ```
4. Try area-based prompts on the existing LLM path. Check unrelated room
   devices are not selected.

The automated tests use WebSocket fixtures and do not require a live HA
installation. The actual HA registry and area assignments must still be
checked on the user's isolated Home Assistant installation.
