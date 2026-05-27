# HA SmartBlock Add-on

HA SmartBlock provides a Blockly-based visual editor for Home Assistant automations.

## Usage

1. Install and start the add-on.
2. Open the Web UI from the add-on page.
3. Build or import an automation.
4. Export YAML or push the automation back to Home Assistant.

The add-on uses Home Assistant's Supervisor token internally. Do not paste long-lived Home Assistant tokens into the UI.

## Notes

- This add-on is experimental.
- The UI is served through Home Assistant Ingress.
- Regression baseline data is stored in the add-on data directory.
