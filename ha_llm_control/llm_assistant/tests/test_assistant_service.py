import json
import unittest

from ha_llm_control.llm_assistant.assistant_service import create_assistant_response, create_final_response
from ha_llm_control.llm_assistant.context import public_context
from ha_llm_control.llm_assistant.provider import public_provider_catalog


class FakeClient:
    def __init__(self, response, model="test-model"):
        self.response = response
        self.model = model
        self.calls = 0

    def generate_text(self, **_kwargs):
        self.calls += 1
        return self.response if isinstance(self.response, str) else json.dumps(self.response)


def context():
    return {
        "entity_cards": [
            {
                "entity_id": "binary_sensor.entry_motion", "friendly_name": "Entry Motion",
                "domain": "binary_sensor", "device_class": "motion", "supported_actions": [],
            },
            {
                "entity_id": "switch.hallway", "friendly_name": "Hallway Switch",
                "domain": "switch", "supported_actions": ["switch.turn_on", "switch.turn_off"],
            },
        ],
        "capabilities": {"services": [{"id": "switch.turn_on", "risk": "low"}]},
    }


class AssistantServiceTests(unittest.TestCase):
    def test_returns_automation_intent_and_validated_plan_without_a_model_status(self):
        response = {
            "intent": "automation",
            "plan": {"yaml": """alias: Entry turns on hallway switch
triggers:
  - trigger: state
    entity_id: binary_sensor.entry_motion
    to: 'on'
conditions: []
actions:
  - action: switch.turn_on
    target:
      entity_id: switch.hallway
"""},
            "missing_fields": [],
        }
        client = FakeClient(response)
        result = create_assistant_response(
            {"command": "When entry motion is detected, turn on the hallway switch.", "home_context": context()},
            client_factory=lambda _provider: client,
        )
        self.assertEqual(result["intent"], "automation")
        self.assertNotIn("status", result)
        self.assertTrue(result["validation"]["valid"])
        self.assertEqual(result["plan"]["automation"]["triggers"][0]["trigger"], "state")
        self.assertEqual(client.calls, 1)
        self.assertEqual(result["metrics"]["attempts"], 1)

    def test_normalizes_legacy_flat_control_to_a_plan_without_propagating_status(self):
        result = create_assistant_response(
            {"command": "Turn on the hallway switch", "home_context": context()},
            client_factory=lambda _provider: FakeClient({
                "intent": "control", "status": "success",
                "service": "switch.turn_on", "entity_id": "switch.hallway",
            }),
        )
        self.assertEqual(result["intent"], "control")
        self.assertEqual(result["plan"]["operation"], "service_control")
        self.assertEqual(result["plan"]["effect"]["service"], "switch.turn_on")
        self.assertEqual(result["plan"]["target"]["entity_id"], "switch.hallway")
        self.assertNotIn("status", result)

    def test_accepts_information_aggregate_plan(self):
        source = context()
        source["information_inventory"] = [{"domain": "fan", "count": 4}]
        result = create_assistant_response(
            {"command": "How many fans are in the home?", "home_context": source},
            client_factory=lambda _provider: FakeClient({
                "intent": "information",
                "plan": {"information_query": {"kind": "aggregate", "aggregation": "count", "domain": "fan"}},
                "missing_fields": [],
            }),
        )
        self.assertTrue(result["validation"]["valid"])
        self.assertEqual(result["plan"]["operation"], "entity_collection")
        self.assertEqual(result["plan"]["target"]["filter"]["domain"], "fan")
        self.assertEqual(result["plan"]["aggregation"], "count")

    def test_normalizes_single_collection_projection_to_a_list(self):
        result = create_assistant_response(
            {"command": "How many fans are in the home?", "home_context": context()},
            client_factory=lambda _provider: FakeClient({
                "intent": "information",
                "plan": {
                    "operation": "entity_collection",
                    "target": {"selector": "entity_filter", "filter": {"domain": "fan"}},
                    "projection": "entity_id",
                    "aggregation": "count",
                },
                "missing_fields": [],
            }),
        )
        self.assertTrue(result["validation"]["valid"])
        self.assertEqual(result["plan"]["projection"], ["entity_id"])

    def test_accepts_an_unresolved_target_as_grounding_abstention(self):
        result = create_assistant_response(
            {"command": "What is the study air purifier status?", "home_context": context()},
            client_factory=lambda _provider: FakeClient({
                "intent": "information",
                "plan": {
                    "operation": "entity_property",
                    "target": {"selector": "unresolved", "reference": "study air purifier"},
                    "property": "state",
                    "user_reference": "study air purifier",
                },
                "missing_fields": [],
            }),
        )
        self.assertTrue(result["validation"]["valid"])
        self.assertEqual(result["plan"]["target"]["selector"], "unresolved")

    def test_maps_legacy_goal_or_routine_to_routine(self):
        result = create_assistant_response(
            {"command": "Prepare me for sleep", "home_context": context()},
            client_factory=lambda _provider: FakeClient({"intent": "goal_or_routine", "reason": "prepare_for_sleep"}),
        )
        self.assertEqual(result["intent"], "routine")
        self.assertEqual(result["plan"]["goal"], "prepare_for_sleep")

    def test_returns_generation_error_for_malformed_yaml_without_retrying(self):
        client = FakeClient({"intent": "automation", "plan": {"yaml": "triggers: ["}, "missing_fields": []})
        result = create_assistant_response(
            {"command": "Turn on the hallway switch", "home_context": context()},
            client_factory=lambda _provider: client,
        )
        self.assertIn("generation_error", result)
        self.assertEqual(client.calls, 1)

    def test_public_provider_catalog_exposes_only_configuration_booleans(self):
        values = {"LLM_PROVIDER": "openai", "OPENAI_API_KEY": "secret", "ANTHROPIC_API_KEY": "", "GOOGLE_API_KEY": "present", "XAI_API_KEY": ""}
        result = public_provider_catalog(lambda key, default="": values.get(key, default))
        self.assertEqual(result["default_provider"], "chatgpt")
        self.assertEqual(result["providers"][0], {"id": "chatgpt", "label": "ChatGPT", "configured": True})

    def test_host_retrieval_scope_is_not_reranked_privately(self):
        source = context()
        source["retrieval"] = {"method": "hybrid_rrf", "candidate_entity_ids": ["switch.hallway"]}
        result = public_context(source, "unrelated wording")
        self.assertEqual([card["entity_id"] for card in result["candidates"]], ["switch.hallway"])

    def test_public_context_keeps_only_a_live_confirmed_referent(self):
        source = context()
        source["interaction_context"] = {
            "last_confirmed_target": {"entity_id": "switch.hallway", "source": "information_query"}
        }
        result = public_context(source, "turn it on")
        self.assertEqual(
            result["interaction_context"]["last_confirmed_target"]["entity_id"],
            "switch.hallway",
        )

    def test_final_response_is_generated_from_host_tool_facts(self):
        client = FakeClient("I turned on the hallway switch.")
        result = create_final_response(
            {
                "command": "Turn on the hallway switch.",
                "response_language": "en",
                "tool_result": {
                    "outcome": "success",
                    "intent": "control",
                    "service": "switch.turn_on",
                    "result": {"status": "success"},
                },
            },
            client_factory=lambda _provider: client,
        )
        self.assertEqual(result["response"], "I turned on the hallway switch.")
        self.assertEqual(client.calls, 1)


if __name__ == "__main__":
    unittest.main()
