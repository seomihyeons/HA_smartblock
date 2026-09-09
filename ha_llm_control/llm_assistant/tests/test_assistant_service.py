import json
import unittest

from ha_llm_control.llm_assistant.assistant_service import create_assistant_response
from ha_llm_control.llm_assistant.context import public_context
from ha_llm_control.llm_assistant.provider import public_provider_catalog


class FakeClient:
    def __init__(self, response, model="test-model"):
        self.responses = response if isinstance(response, list) else [response]
        self.model = model

    def generate_text(self, **_kwargs):
        return json.dumps(self.responses.pop(0))


def context():
    return {
        "entity_cards": [
            {
                "entity_id": "binary_sensor.entry_motion",
                "friendly_name": "Entry Motion",
                "domain": "binary_sensor",
                "device_class": "motion",
                "supported_actions": [],
            },
            {
                "entity_id": "switch.hallway",
                "friendly_name": "Hallway Switch",
                "domain": "switch",
                "supported_actions": ["switch.turn_on", "switch.turn_off"],
            },
        ],
        "capabilities": {"services": [{"id": "switch.turn_on", "risk": "low"}]},
    }


class AssistantServiceTests(unittest.TestCase):
    def test_accepts_grounded_automation_yaml(self):
        response = {
            "status": "success",
            "yaml": """alias: Entry turns on hallway switch
triggers:
  - trigger: state
    entity_id: binary_sensor.entry_motion
    to: 'on'
conditions: []
actions:
  - action: switch.turn_on
    target:
      entity_id: switch.hallway
""",
        }
        result = create_assistant_response(
            {"command": "When entry motion is detected, turn on the hallway switch.", "home_context": context()},
            client_factory=lambda _provider: FakeClient(response),
        )
        self.assertEqual(result["status"], "success")
        self.assertTrue(result["validation"]["valid"])
        self.assertIn("triggers:", result["normalized_yaml"])

    def test_rejects_hallucinated_entity(self):
        response = {
            "status": "success",
            "yaml": "actions:\n  - action: switch.turn_on\n    target:\n      entity_id: switch.invented\n",
        }
        result = create_assistant_response(
            {"command": "Turn on a switch", "home_context": context()},
            client_factory=lambda _provider: FakeClient(response),
        )
        self.assertEqual(result["status"], "failure")
        self.assertIn("outside Home Assistant context", result["validation"]["errors"][0])

    def test_normalizes_legacy_yaml_platform_before_validation(self):
        response = {
            "status": "success",
            "yaml": """triggers:
  - platform: state
    entity_id: binary_sensor.entry_motion
    to: 'on'
conditions: []
actions:
  - action: switch.turn_on
    target:
      entity_id: switch.hallway
""",
        }
        result = create_assistant_response(
            {"command": "When entry motion is detected, turn on the hallway switch.", "home_context": context()},
            client_factory=lambda _provider: FakeClient(response),
        )
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["automation"]["triggers"][0]["trigger"], "state")
        self.assertNotIn("platform", result["automation"]["triggers"][0])
        self.assertTrue(result["validation"]["normalizations"])

    def test_rejects_conflicting_compatibility_aliases(self):
        response = {
            "status": "success",
            "yaml": """triggers:
  - trigger: state
    platform: event
    entity_id: binary_sensor.entry_motion
conditions: []
actions:
  - action: switch.turn_on
    target:
      entity_id: switch.hallway
""",
        }
        result = create_assistant_response(
            {"command": "When entry motion is detected, turn on the hallway switch.", "home_context": context()},
            client_factory=lambda _provider: FakeClient([response, response]),
        )
        self.assertEqual(result["status"], "failure")
        self.assertIn("conflicting trigger and platform", result["validation"]["errors"][0])

    def test_preserves_clarification_without_executable_draft(self):
        result = create_assistant_response(
            {"command": "Turn something on", "home_context": context()},
            client_factory=lambda _provider: FakeClient({"status": "needs_clarification", "question": "Which device?"}),
        )
        self.assertEqual(result["status"], "needs_clarification")
        self.assertEqual(result["automation"], None)

    def test_repairs_one_invalid_provider_response(self):
        invalid = {
            "status": "success",
            "yaml": "actions:\n  - action: switch.turn_on\n    target:\n      entity_id: switch.unknown\n",
        }
        corrected = {
            "status": "success",
            "yaml": "actions:\n  - action: switch.turn_on\n    target:\n      entity_id: switch.hallway\n",
        }
        client = FakeClient([invalid, corrected])
        result = create_assistant_response(
            {"command": "Turn on the hallway switch", "home_context": context(), "provider": "openai"},
            client_factory=lambda _provider: client,
        )
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["metrics"]["provider"], "chatgpt")
        self.assertEqual(result["metrics"]["attempts"], 2)

    def test_rejects_malformed_yaml(self):
        malformed = {"status": "success", "yaml": "triggers: [\n"}
        result = create_assistant_response(
            {"command": "Turn on the hallway switch", "home_context": context()},
            client_factory=lambda _provider: FakeClient([malformed, malformed]),
        )
        self.assertEqual(result["status"], "failure")
        self.assertIn("could not be parsed", result["reason"])

    def test_rejects_unknown_provider_before_calling_api(self):
        result = create_assistant_response(
            {"command": "Turn on the hallway switch", "home_context": context(), "provider": "unknown"},
            client_factory=lambda _provider: self.fail("Provider must not be constructed."),
        )
        self.assertEqual(result["status"], "failure")
        self.assertIn("Unsupported provider", result["reason"])

    def test_public_provider_catalog_exposes_only_configuration_booleans(self):
        values = {
            "LLM_PROVIDER": "openai",
            "OPENAI_API_KEY": "secret-value",
            "ANTHROPIC_API_KEY": "",
            "GOOGLE_API_KEY": "present",
            "XAI_API_KEY": "",
        }
        result = public_provider_catalog(lambda key, default="": values.get(key, default))
        self.assertEqual(result["default_provider"], "chatgpt")
        self.assertEqual(result["providers"], [
            {"id": "chatgpt", "label": "ChatGPT", "configured": True},
            {"id": "claude", "label": "Claude", "configured": False},
            {"id": "gemini", "label": "Gemini", "configured": True},
            {"id": "grok", "label": "Grok", "configured": False},
        ])

    def test_candidate_ranking_matches_spacing_variants_without_an_alias_table(self):
        source = context()
        source["entity_cards"].extend([
            {
                "entity_id": "light.livingroom_light",
                "friendly_name": "Livingroom Light",
                "domain": "light",
                "supported_actions": ["light.turn_on"],
            },
            {
                "entity_id": "light.room_light",
                "friendly_name": "Room Light",
                "domain": "light",
                "supported_actions": ["light.turn_on"],
            },
        ])
        result = public_context(source, "When entrance motion is detected, turn on the living room light.")
        self.assertEqual(result["candidates"][0]["entity_id"], "light.livingroom_light")
        self.assertEqual(result["resolved_entity_references"], [
            {
                "entity_id": "light.livingroom_light",
                "friendly_name": "Livingroom Light",
                "matched_name": "livingroomlight",
                "evidence": "normalized_exact_name",
            },
            {
                "entity_id": "binary_sensor.entry_motion",
                "friendly_name": "Entry Motion",
                "matched_name": "motion",
                "evidence": "name_and_device_class",
            },
        ])

    def test_uses_host_retrieval_scope_without_re_ranking_it_privately(self):
        source = context()
        source["retrieval"] = {
            "method": "hybrid_rrf",
            "candidate_entity_ids": ["switch.hallway", "binary_sensor.entry_motion"],
            "ranking": [
                {"entity_id": "switch.hallway", "rank": 1},
                {"entity_id": "binary_sensor.entry_motion", "rank": 2},
            ],
        }
        result = public_context(source, "an unrelated wording")
        self.assertEqual([card["entity_id"] for card in result["candidates"]], [
            "switch.hallway", "binary_sensor.entry_motion",
        ])
        self.assertEqual(result["retrieval"]["method"], "hybrid_rrf")

    def test_rejects_yaml_that_omits_a_server_resolved_entity(self):
        source = context()
        source["entity_resolution"] = [{
            "reference": "hallwayswitch", "status": "resolved", "entity_id": "switch.hallway",
        }]
        response = {"status": "success", "yaml": """actions:
  - action: switch.turn_on
    target:
      entity_id: binary_sensor.entry_motion
"""}
        result = create_assistant_response(
            {"command": "Turn on the hallway switch", "home_context": source},
            client_factory=lambda _provider: FakeClient([response, response]),
        )
        self.assertEqual(result["status"], "failure")
        self.assertTrue(any(
            "omitted a server-resolved entity" in error
            for error in result["validation"]["errors"]
        ))

    def test_accepts_a_grounded_immediate_control_without_yaml(self):
        response = {
            "intent": "control",
            "status": "success",
            "service": "switch.turn_on",
            "entity_id": "switch.hallway",
        }
        result = create_assistant_response(
            {"command": "Turn on the hallway switch", "home_context": context()},
            client_factory=lambda _provider: FakeClient(response),
        )
        self.assertEqual(result["intent"], "control")
        self.assertEqual(result["status"], "success")
        self.assertTrue(result["validation"]["valid"])
        self.assertEqual(result["yaml"], "")

    def test_rejects_control_that_conflicts_with_resolved_entity(self):
        source = context()
        source["entity_resolution"] = [{
            "reference": "hallwayswitch", "status": "resolved", "entity_id": "switch.hallway",
        }]
        response = {
            "intent": "control",
            "status": "success",
            "service": "switch.turn_on",
            "entity_id": "binary_sensor.entry_motion",
        }
        result = create_assistant_response(
            {"command": "Turn on the hallway switch", "home_context": source},
            client_factory=lambda _provider: FakeClient([response, response]),
        )
        self.assertEqual(result["status"], "failure")
        self.assertTrue(any("conflicts with a server-resolved" in error for error in result["validation"]["errors"]))

    def test_preserves_no_match_without_an_executable_artifact(self):
        result = create_assistant_response(
            {"command": "Turn on a study air purifier", "home_context": context()},
            client_factory=lambda _provider: FakeClient({
                "intent": "no_match", "status": "no_match", "reason": "No matching entity is available.",
            }),
        )
        self.assertEqual(result["intent"], "no_match")
        self.assertEqual(result["status"], "no_match")
        self.assertEqual(result["automation"], None)


if __name__ == "__main__":
    unittest.main()
