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

## Local setup

1. Create six areas in the isolated Home Assistant installation: Bedroom,
   Living Room, Bathroom, Kitchen, Entrance and Hallway.
2. Check the virtual devices' actual area assignments in HA Settings > Devices.
   MQTT `suggested_area` does not overwrite an existing manual assignment.
3. Configure `HA_BASE_URL` and `HA_TOKEN` in the local server environment.
   The next assistant request reads HA area metadata; the default cache TTL
   is 60 seconds.
4. Area-based requests use the same existing EntityCard retrieval and planning
   path, without requiring another LLM call.

Any verification scripts, screenshots, or results should be kept outside the
repository in an ignored local-only directory, not committed to GitHub.
