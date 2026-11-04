"""Regression tests for grounded goal-based automation drafts."""

import unittest

from smartblock_llm.validation import validate_response


CONTEXT = {
    "entity_cards": [
        {
            "entity_id": "light.bedroom",
            "domain": "light",
            "friendly_name": "Bedroom Light",
            "state": "on",
            "supported_actions": ["light.turn_off", "light.turn_on"],
        },
    ],
    "capabilities": {
        "services": [
            {"id": "light.turn_off", "target_required": True},
        ],
    },
    "automation_dialect_contract": {
        "trigger_kinds": ["event", "time", "state"],
        "condition_kinds": ["state", "time", "and", "or", "not"],
        "action_structures": ["service", "delay", "choose"],
    },
    "entity_resolution": [],
}

GOAL_YAML = """alias: Sleep Preparation
triggers:
  - trigger: event
    event_type: smartblock_goal_requested
    event_data:
      goal_id: prepare_for_sleep
conditions: []
actions:
  - action: light.turn_off
    target:
      entity_id: light.bedroom
"""


class GoalAutomationTests(unittest.TestCase):
    def plan(self, yaml_source=GOAL_YAML):
        return {
            "intent": "routine",
            "plan": {
                "operation": "automation_generation",
                "goal": "prepare_for_sleep",
                "yaml": yaml_source,
            },
            "missing_fields": [],
        }

    def test_valid_goal_event_draft_is_parsed_and_grounded(self):
        result = validate_response(self.plan(), CONTEXT)
        self.assertTrue(result["validation"]["valid"], result["validation"]["errors"])
        self.assertEqual(result["intent"], "routine")
        self.assertEqual(result["automation"]["triggers"][0]["event_data"]["goal_id"], "prepare_for_sleep")

    def test_invalid_goal_event_identifier_rejected(self):
        result = validate_response(self.plan(GOAL_YAML.replace(
            "goal_id: prepare_for_sleep", "goal_id: Sleep!"
        )), CONTEXT)
        self.assertFalse(result["validation"]["valid"])

    def test_unknown_target_cannot_be_grounded(self):
        result = validate_response(self.plan(GOAL_YAML.replace(
            "light.bedroom", "light.nonexistent"
        )), CONTEXT)
        self.assertFalse(result["validation"]["valid"])

    def test_explicit_time_trigger_stays_allowed(self):
        explicit_yaml = GOAL_YAML.replace(
            """  - trigger: event
    event_type: smartblock_goal_requested
    event_data:
      goal_id: prepare_for_sleep""",
            """  - trigger: time
    at: "23:00:00" """.rstrip(),
        )
        result = validate_response(self.plan(explicit_yaml), CONTEXT)
        self.assertTrue(result["validation"]["valid"], result["validation"]["errors"])


if __name__ == "__main__":
    unittest.main()
