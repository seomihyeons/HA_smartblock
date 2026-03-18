# HA Smart Block  
**Visual Round-Trip Programming Environment for Home Assistant**  

## Home Assistant
[Home Assistant](https://www.home-assistant.io/) is one of the leading open-source IoT platforms.  
It enables users to automate smart devices through YAML-based automation scripts that combine **triggers**, **conditions**, and **actions**.

However, YAML syntax requires users to handle indentation, nested logic, and strict formatting —  
which can make automation difficult for non-developers.

## HA Smart Block
**HA Smart Block** extends the idea of *Smart Block (for SmartThings)* to the **Home Assistant** environment.  
It allows users to **create and edit automations visually** without writing YAML code manually.

When users build their automations with blocks,  
the system automatically generates valid Home Assistant YAML code,  
and conversely, users can import existing YAML files to view and modify them as visual blocks.

Thus, **HA Smart Block provides a true Round-Trip editing environment**:  
YAML ⇄ Visual Blocks ⇄ YAML.

![HA Block](https://github.com/seomihyeons/HA_smartblock/blob/main/ha_smartblock.png)

## Key Features
- Visual editor for triggers, conditions, and actions  
- Round-trip editing: YAML ↔ Blocks ↔ YAML  
- Import normalization with raw fallback for unsupported syntax  
- Home Assistant pull/push for live automations  
- Conflict Analyzer integration for Event–Action consistency  
- Task Alt batch verification with baseline regression checks  

## How to Access the Program
To run the **HA Smart Block** program locally, first download or clone this repository from GitHub.  
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
- `.env` is ignored by git, so each user must create it locally.
- Do not expose the dev server publicly while using `HA_TOKEN`.
- If you only need the visual editor without HA integration, `.env` is optional.
- If Home Assistant is not connected, the visual editor works but pull/push/analyzer are unavailable.

Optional variables:
- HA_IP  
- HA_PORT  
- ANALYZER_HOST  
- ANALYZER_PORT  
- DEV_SERVER_HOST  
- HA_SSL_VERIFY  

## Home Assistant Integration
Live pull/push requires HA credentials:
- Set `HA_BASE_URL` or `HA_IP` / `HA_PORT`
- Set `HA_TOKEN`

## Conflict Analyzer
- UI entry: 🛠 button → Run (sends request only)  
- The analyzer server must be running only if you use Conflict Analyzer:
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
- Do not expose the dev server publicly when using HA_TOKEN.  
- If LAN access is required, set `DEV_SERVER_HOST=0.0.0.0` and add your own access guard.

## Demo Video
[Watch the Demo Video](https://youtu.be/jua_SjaCClo?si=6nmnx814JoCcibmV)
