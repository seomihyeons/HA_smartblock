# HA-SmartBlock
**Visual Round-Trip Programming Environment for Home Assistant**

## Home Assistant
[Home Assistant](https://www.home-assistant.io/) is one of the leading open-source IoT platforms.  
It enables users to automate smart devices through YAML-based automation scripts that combine **triggers**, **conditions**, and **actions**.

However, YAML syntax requires users to handle indentation, nested logic, and strict formatting —  
which can make automation difficult for non-developers.

## Overview
**HA-SmartBlock** extends the idea of *Smart Block (for SmartThings)* to the **Home Assistant** environment.  
It allows users to **create and edit automations visually** without writing YAML code manually.

When users build their automations with blocks,  
the system automatically generates valid Home Assistant YAML code,  
and conversely, users can import existing YAML files to view and modify them as visual blocks.

Thus, **HA-SmartBlock provides a true round-trip editing environment**:  
YAML ⇄ Visual Blocks ⇄ YAML.

![HA-SmartBlock](./ha_smartblock.png)

## Key Features
- Visual block editor for Home Assistant triggers, conditions, and actions
- Round-trip editing between YAML and Blockly blocks
- Import normalization with fallback preservation for unsupported syntax
- Home Assistant automation pull and push support
- Conflict Analyzer (E-A) integration
- Automation Regression Test workflow for batch verification
- Alias-based automatic `id` generation when pushing automations without an `id`

## How to Access the Program
To run the **HA-SmartBlock** program locally, first download or clone this repository from GitHub.  
After extracting or cloning the files, open a terminal (PowerShell or VS Code terminal) and navigate to the project root: `/blockly`.

Then install dependencies and launch the program:
~~~bash
npm install
npm run start
~~~

## Environment Variables (HA Integration)
To use Home Assistant integration features (automation list, pull/push, conflict analyzer), create a local `.env` file in the project root.

Example:
~~~env
HA_BASE_URL=http://<HA_IP>:8123
HA_TOKEN=<YOUR_LONG_LIVED_TOKEN>
~~~

Notes:
- `.env` is ignored by git and must be created locally
- if `.env` is missing, the visual block editor still works, but HA pull/push and analyzer features are unavailable
- do not expose the local dev server publicly while using `HA_TOKEN`

Optional variables:
- HA_IP
- HA_PORT
- ANALYZER_HOST
- ANALYZER_PORT
- DEV_SERVER_HOST
- HA_SSL_VERIFY

## Home Assistant Integration
HA-SmartBlock can interact with a running Home Assistant instance.

Supported workflows:
- load automations from Home Assistant
- import an automation into the Blockly workspace
- export the current workspace as YAML
- save the current automation back to Home Assistant

If an automation `id` is missing, HA-SmartBlock generates one automatically using:

```text
sb_<alias_slug>_<short_suffix>
```

The generated `id` is written back into the workspace so later saves update the same automation.

Live pull/push requires HA credentials:
- Set `HA_BASE_URL` or `HA_IP` / `HA_PORT`
- Set `HA_TOKEN`

## Conflict Analyzer (E-A)
UI entry: `🛠`

The analyzer reports summary information such as:
- automations analyzed
- events
- actions
- rule edges
- inconsistency issues
- conflict types
- conflicting entities
- elapsed time

If no conflicts are detected, the UI reports:

```text
No inconsistency detected.
System logic is consistent.
```

To use the analyzer backend directly:

~~~bash
node server/analyze_server.js
~~~

- Python analyzer: `src/homeassistant/conflict_analyzer/ha_eca_conflict_analyzer.py`
- Requires Python 3 and PyYAML
- [Analyzer Repository](https://github.com/kwanghoon/haanalyzer)

## Task Alt Verification
- UI entry: ⛏ inside the app
- Datasets: `test/test_*`
- Baseline stored via local dev server API
- Regression report highlights status, count, and RAW changes
- Note: datasets are large and intended for verification use

## Security Notes
- Dev server and analyzer are local-only by default.
- Do not expose the dev server publicly when using `HA_TOKEN`.
- If LAN access is required, set `DEV_SERVER_HOST=0.0.0.0` and add your own access guard.

## Demo Video
[Watch the Demo Video](https://youtu.be/jua_SjaCClo?si=6nmnx814JoCcibmV)
