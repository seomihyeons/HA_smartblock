# HA SmartBlock Add-on

HA SmartBlock is a visual Blockly editor for Home Assistant automations.

It helps you load existing automations, inspect them as blocks, edit the logic visually, and export or push YAML back to Home Assistant.

## Features

- Load Home Assistant automations
- Use entity dropdowns populated from your Home Assistant instance
- Open automations as Blockly workspaces
- Export or copy generated YAML
- Push automation changes back to Home Assistant
- Run automation analysis
- Test Task Alt YAML files

## Getting Started

1. Install and start the add-on.
2. Open the Web UI.
3. Use **Load** to import automations from Home Assistant.
4. Select an automation to open it in Blockly.
5. Export, copy, analyze, or push the generated YAML.

## Home Assistant Access

The add-on uses Home Assistant's Supervisor token internally, so you do not need to paste a long-lived Home Assistant token into the UI.

Entity dropdowns are loaded from Home Assistant when the Web UI starts. If the Home Assistant API is unavailable, HA SmartBlock falls back to bundled sample entities so the editor can still open.

## Analyzer

The analyzer can inspect automations for potential logic issues. If no issues are detected, the UI reports that the system logic is consistent.

## Task Alt

Task Alt can import YAML files and run regression-style checks. Baseline data is stored in the add-on data directory.
