# AI Automation Assistant MVP

This branch contains the first reviewable vertical slice for the competition feature.

## Current flow

1. Open the `🗨︎` floating button.
2. Enter a motion-to-light automation request.
3. The analyzer server reads the current Home Assistant states.
4. A deterministic fake provider selects grounded entity candidates.
5. The server validates the draft against the supplied entity context.
6. The user explicitly imports the validated draft into Blockly.
7. The optional conflict action compares the draft with editable, enabled Home Assistant automations.

The MVP does not save an automation or call a Home Assistant action. Home Assistant access in this flow is read-only.

## Supported request shape

The fake provider intentionally supports one narrow scenario:

```text
motion state trigger -> light.turn_on action
```

Example:

```text
현관 움직임이 감지되면 거실 무드램프를 켜줘
```

Ambiguous light or motion-sensor candidates produce a confirmation response. Requests outside the scenario produce an `unsupported` response.

## Run locally

Start the analyzer and draft API:

```powershell
node server\analyze_server.js
```

Start the web application in a second terminal:

```powershell
npm start
```

The root `.env` must contain the existing Home Assistant connection settings used by the project. Tokens are never included in the draft prompt or response.

## Verify

```powershell
npm run test:llm
npm run build
npm audit --omit=dev
```

## Deliberately not implemented yet

- Ollama or another real model provider
- JSON Schema constrained decoding
- entity/device/area registry joins
- embedding retrieval
- automation save or activation
- direct device control
- add-on source parity

These are staged after review of the interaction and Blockly import behavior.
