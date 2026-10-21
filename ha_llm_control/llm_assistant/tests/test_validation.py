import unittest
from unittest.mock import patch
import json
import io
from ha_llm_control.llm_assistant.validation import validate_response
from ha_llm_control.llm_api.ollama import OllamaClient


def context():
    return {
        "entity_cards": [
            {"entity_id": "binary_sensor.motion", "supported_actions": []},
            {"entity_id": "light.test", "supported_actions": ["light.turn_on"]},
        ],
        "capabilities": {"services": [{"id": "light.turn_on", "target_required": True}]},
        "automation_dialect_contract": {"trigger_kinds": ["state"], "condition_kinds": ["state", "and"], "action_structures": ["service", "delay", "choose"]},
    }


class ValidationTests(unittest.TestCase):
    def validate(self, trigger="state", conditions="[]", actions=None):
        actions = actions or "- action: light.turn_on\n  target:\n    entity_id: light.test\n"
        source = f"triggers:\n- trigger: {trigger}\n  entity_id: binary_sensor.motion\n  to: 'on'\nconditions: {conditions}\nactions:\n{actions}"
        return validate_response({"intent": "automation", "plan": {"yaml": source}}, context())

    def test_unknown_trigger_is_not_a_valid_visual_draft(self):
        result = self.validate(trigger="invented_trigger")
        self.assertFalse(result["validation"]["valid"])
        self.assertIn("invented_trigger", str(result["validation"]["errors"]))

    def test_nested_entity_is_grounded_recursively(self):
        result = self.validate(conditions="\n- condition: and\n  conditions:\n  - condition: state\n    entity_id: sensor.missing\n    state: 'on'")
        self.assertFalse(result["validation"]["valid"])
        self.assertIn("sensor.missing", str(result["validation"]["errors"]))

    def test_choose_delay_and_nested_service_use_the_same_contract(self):
        result = self.validate(actions="- choose:\n  - conditions: []\n    sequence:\n    - delay: '00:00:01'\n    - service: light.turn_on\n      target:\n        entity_id: light.test\n")
        self.assertTrue(result["validation"]["valid"], result)
        self.assertFalse(result["validation"]["blockly_supported"])
        self.assertTrue(result["validation"]["requires_host_validation"])

    def test_nested_service_cannot_bypass_capabilities(self):
        result = self.validate(actions="- choose:\n  - conditions: []\n    sequence:\n    - action: lock.unlock\n      target:\n        entity_id: light.test\n")
        self.assertFalse(result["validation"]["valid"])
        self.assertIn("lock.unlock", str(result["validation"]["errors"]))

    def test_ollama_transport_has_no_sdk_or_live_network_requirement(self):
        with patch("urllib.request.urlopen", return_value=io.BytesIO(json.dumps({"message": {"content": "fixture response"}}).encode())) as request:
            result = OllamaClient().generate_text("fixture", "system", 320)
        self.assertEqual(result, "fixture response")
        body = json.loads(request.call_args.args[0].data)
        self.assertFalse(body["stream"])
        self.assertEqual(body["options"]["num_predict"], 320)


if __name__ == "__main__":
    unittest.main()
