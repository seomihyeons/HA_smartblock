"""Regression tests for live-HA and unsaved-Blockly combined conflict analysis."""
import unittest

from src.homeassistant.conflict_analyzer.ha_eca_conflict_analyzer import (
    merge_ha_automations_with_draft,
)

DRAFT = """alias: New Rule
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
    to: 'on'
actions:
  - action: light.turn_off
    target:
      entity_id: light.living_room
"""

class MixedConflictAnalysisTests(unittest.TestCase):
    def test_new_draft_added_without_saving_to_ha(self):
        existing = [{"id": "old-1", "alias": "Existing Rule"}]
        merged, scope = merge_ha_automations_with_draft(existing, DRAFT)
        self.assertEqual(len(merged), 2)
        self.assertEqual(scope, {"existing_count": 1, "draft_count": 1})
        self.assertEqual(existing, [{"id": "old-1", "alias": "Existing Rule"}])

    def test_original_automation_is_replaced_not_duplicated(self):
        existing = [{"id": "old-1"}, {"id": "old-2"}]
        merged, scope = merge_ha_automations_with_draft(existing, DRAFT, "old-1")
        self.assertEqual([item.get("id") for item in merged], ["old-2", None])
        self.assertEqual(scope, {"existing_count": 1, "draft_count": 1})

    def test_no_draft_preserves_existing_behavior(self):
        existing = [{"id": "old-1"}]
        merged, scope = merge_ha_automations_with_draft(existing, "")
        self.assertEqual(merged, existing)
        self.assertIsNone(scope)

    def test_invalid_draft_is_rejected(self):
        with self.assertRaises(ValueError):
            merge_ha_automations_with_draft([], "- not: an automation")
        with self.assertRaises(ValueError):
            merge_ha_automations_with_draft([], "alias: Invalid\nactions: []\n")

if __name__ == '__main__':
    unittest.main()
