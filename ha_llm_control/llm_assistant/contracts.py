"""Small, provider-neutral contracts for the automation assistant API."""

from __future__ import annotations

from copy import deepcopy
from typing import Any


INTENT_AUTOMATION = "automation"
INTENT_CONTROL = "control"
INTENT_INFORMATION = "information"
INTENT_ROUTINE = "routine"
INTENT_OTHER = "other"
VALID_INTENTS = {
    INTENT_AUTOMATION,
    INTENT_CONTROL,
    INTENT_INFORMATION,
    INTENT_ROUTINE,
    INTENT_OTHER,
}

# These are host operations, not Home Assistant service names.  They give an
# LLM a small, composable planning vocabulary while the Node/HA boundary owns
# target expansion, capability checks, and execution.
OPERATION_ENTITY_PROPERTY = "entity_property"
OPERATION_ENTITY_COLLECTION = "entity_collection"
OPERATION_SERVICE_CONTROL = "service_control"
OPERATION_AUTOMATION_GENERATION = "automation_generation"
OPERATION_GOAL_PLAN = "goal_plan"
VALID_OPERATIONS = {
    OPERATION_ENTITY_PROPERTY,
    OPERATION_ENTITY_COLLECTION,
    OPERATION_SERVICE_CONTROL,
    OPERATION_AUTOMATION_GENERATION,
    OPERATION_GOAL_PLAN,
}

# Provider output is an intent and a plan only.  The Node/HA boundary owns
# these resolution values after live metadata and schema validation.
RESOLUTION_SUCCESS = "success"
RESOLUTION_AMBIGUOUS = "ambiguous"
RESOLUTION_FAILED = "failed"
FAILURE_ENTITY_NOT_FOUND = "entity_not_found"
FAILURE_UNSUPPORTED_CAPABILITY = "unsupported_capability"
FAILURE_INVALID_REQUEST = "invalid_request"

AUTOMATION_IR_SCHEMA_VERSION = 1
DEFAULT_RESPONSE = {
    "intent": INTENT_AUTOMATION,
    "plan": {},
    "missing_fields": [],
    "validation": {"valid": False, "errors": []},
    "metrics": {},
}


def as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def _canonical_alias(
    source: dict[str, Any], canonical: str, aliases: tuple[str, ...], path: str,
    conflicts: list[str], normalizations: list[str],
) -> Any:
    present = [(key, source[key]) for key in (canonical, *aliases) if key in source and source[key] is not None]
    if not present:
        return None
    chosen_key, chosen_value = next(((key, value) for key, value in present if key == canonical), present[0])
    for key, value in present:
        if chosen_value != value:
            conflicts.append(f"{path} has conflicting {chosen_key} and {key} values.")
            break
    if chosen_key != canonical:
        normalizations.append(f"{path}.{chosen_key} was normalized to {path}.{canonical}.")
    return chosen_value


def normalize_to_automation_ir(value: Any) -> dict[str, Any]:
    """Normalize YAML-era aliases before strict LLM-draft validation."""
    if not isinstance(value, dict):
        return {"automation": value, "conflicts": [], "normalizations": []}

    automation = deepcopy(value)
    conflicts: list[str] = []
    normalizations: list[str] = []
    trigger_source = _canonical_alias(automation, "triggers", ("trigger",), "automation", conflicts, normalizations)
    condition_source = _canonical_alias(automation, "conditions", ("condition",), "automation", conflicts, normalizations)
    action_source = _canonical_alias(automation, "actions", ("action",), "automation", conflicts, normalizations)

    triggers = []
    for index, item in enumerate(as_list(trigger_source)):
        if not isinstance(item, dict):
            triggers.append(item)
            continue
        node = deepcopy(item)
        kind = _canonical_alias(node, "trigger", ("platform", "type"), f"triggers[{index}]", conflicts, normalizations)
        if kind is not None:
            node["trigger"] = kind
        node.pop("platform", None)
        node.pop("type", None)
        triggers.append(node)

    actions = []
    for index, item in enumerate(as_list(action_source)):
        if not isinstance(item, dict):
            actions.append(item)
            continue
        node = deepcopy(item)
        service = _canonical_alias(node, "action", ("service",), f"actions[{index}]", conflicts, normalizations)
        if service is not None:
            node["action"] = service
        node.pop("service", None)
        actions.append(node)

    def normalize_nested_action(node):
        if not isinstance(node, dict):
            return node
        node = deepcopy(node)
        service = _canonical_alias(node, "action", ("service",), "nested action", conflicts, normalizations)
        if service is not None:
            node["action"] = service
        node.pop("service", None)
        if isinstance(node.get("choose"), list):
            for choice in node["choose"]:
                if isinstance(choice, dict):
                    choice["sequence"] = [normalize_nested_action(child) for child in as_list(choice.get("sequence"))]
            node["default"] = [normalize_nested_action(child) for child in as_list(node.get("default"))]
        return node
    actions = [normalize_nested_action(node) for node in actions]

    automation["triggers"] = triggers
    automation["conditions"] = as_list(condition_source)
    automation["actions"] = actions
    automation.pop("trigger", None)
    automation.pop("condition", None)
    automation.pop("action", None)
    return {"automation": automation, "conflicts": conflicts, "normalizations": normalizations}


def normalize_plan(value: Any) -> dict[str, Any]:
    """Normalize one provider-neutral intent/plan response.

    Legacy flat envelopes are accepted while providers migrate, but a model's
    status/no-match/unsupported claim is never propagated as an outcome.
    """
    out = deepcopy(DEFAULT_RESPONSE)
    if not isinstance(value, dict):
        out["validation"] = {"valid": False, "errors": ["The model response was not a JSON object."]}
        return out

    raw_intent = str(value.get("intent") or INTENT_AUTOMATION).strip().lower()
    out["intent"] = {
        "goal_or_routine": INTENT_ROUTINE,
        "no_match": INTENT_OTHER,
        "unsupported": INTENT_OTHER,
    }.get(raw_intent, raw_intent)
    if out["intent"] not in VALID_INTENTS:
        out["intent"] = INTENT_OTHER
    plan = value.get("plan") if isinstance(value.get("plan"), dict) else {}
    if not plan:
        if out["intent"] == INTENT_AUTOMATION:
            plan = {"yaml": value.get("yaml") if isinstance(value.get("yaml"), str) else ""}
        elif out["intent"] == INTENT_CONTROL:
            plan = {
                "service": str(value.get("service") or "").strip(),
                "entity_id": str(value.get("entity_id") or "").strip(),
                "data": value.get("data") if isinstance(value.get("data"), dict) else {},
            }
        elif out["intent"] == INTENT_INFORMATION:
            plan = {
                "entity_id": str(value.get("entity_id") or "").strip(),
                "information_query": value.get("information_query") if isinstance(value.get("information_query"), dict) else {},
            }
        elif out["intent"] == INTENT_ROUTINE:
            plan = {"goal": str(value.get("goal") or value.get("reason") or "").strip()}

    # Accept the former narrow envelopes during migration, but expose one
    # selector-based plan to the server from this point on.
    if out["intent"] == INTENT_CONTROL and "operation" not in plan:
        entity_id = str(plan.get("entity_id") or "").strip()
        plan = {
            "operation": OPERATION_SERVICE_CONTROL,
            "target": {"selector": "entity", "entity_id": entity_id},
            "effect": {
                "service": str(plan.get("service") or "").strip(),
                "data": plan.get("data") if isinstance(plan.get("data"), dict) else {},
            },
            **({"user_reference": plan["user_reference"]} if "user_reference" in plan else {}),
        }
    elif out["intent"] == INTENT_INFORMATION and "operation" not in plan:
        entity_id = str(plan.get("entity_id") or "").strip()
        query = plan.get("information_query") if isinstance(plan.get("information_query"), dict) else {}
        if query:
            plan = {
                "operation": OPERATION_ENTITY_COLLECTION,
                "target": {"selector": "entity_filter", "filter": {
                    "domain": str(query.get("domain") or "").strip() or None,
                }},
                "projection": ["display_name", "state"],
                "aggregation": str(query.get("aggregation") or "").strip() or None,
                **({"user_reference": plan["user_reference"]} if "user_reference" in plan else {}),
            }
        else:
            plan = {
                "operation": OPERATION_ENTITY_PROPERTY,
                "target": {"selector": "entity", "entity_id": entity_id},
                "property": "state",
                **({"user_reference": plan["user_reference"]} if "user_reference" in plan else {}),
            }
    elif out["intent"] == INTENT_AUTOMATION and "operation" not in plan:
        plan["operation"] = OPERATION_AUTOMATION_GENERATION
    elif out["intent"] == INTENT_ROUTINE and "operation" not in plan:
        plan["operation"] = OPERATION_GOAL_PLAN

    # Providers commonly emit a scalar when a JSON schema conceptually allows
    # a one-item list.  Canonicalize these harmless representation variants at
    # the boundary; semantic validation still rejects unknown fields/values.
    target = plan.get("target") if isinstance(plan.get("target"), dict) else None
    if target:
        target["selector"] = str(target.get("selector") or "").strip()
        if "context_source" in target:
            source = str(target.get("context_source") or "").strip()
            if source == "last_confirmed_target":
                target["context_source"] = source
                target["context_evidence"] = str(target.get("context_evidence") or "").strip()[:120]
            else:
                target.pop("context_source", None)
                target.pop("context_evidence", None)
        if target.get("selector") == "entity":
            target["entity_id"] = str(target.get("entity_id") or "").strip()
        if target.get("selector") == "unresolved":
            target["reference"] = str(target.get("reference") or "").strip()[:120]
        if target.get("selector") == "entity_filter":
            filter_value = target.get("filter") if isinstance(target.get("filter"), dict) else {}
            raw_ids = filter_value.get("entity_ids")
            if isinstance(raw_ids, str):
                filter_value["entity_ids"] = [raw_ids]
            elif raw_ids is None:
                filter_value["entity_ids"] = []
            elif not isinstance(raw_ids, list):
                filter_value["entity_ids"] = []
            target["filter"] = filter_value
            target["scope"] = str(target.get("scope") or "").strip()
            target["scope_reference"] = str(target.get("scope_reference") or "").strip()[:120]
    if plan.get("operation") == OPERATION_ENTITY_COLLECTION:
        projection = plan.get("projection")
        if isinstance(projection, str) and projection.strip():
            plan["projection"] = [projection.strip()]
        elif projection is None:
            plan["projection"] = []
    # This is presentation metadata only.  The Node boundary later verifies
    # that it occurs in the original request before it can be shown to a user.
    if "user_reference" in plan:
        reference = plan.get("user_reference")
        if isinstance(reference, str) and reference.strip():
            plan["user_reference"] = reference.strip()[:120]
        else:
            plan.pop("user_reference", None)
    out["plan"] = plan
    out["missing_fields"] = [str(item).strip() for item in as_list(value.get("missing_fields")) if str(item).strip()]
    out["validation"] = {"valid": True, "errors": []}
    return out


def generation_failure(reason: str, *, errors: list[str] | None = None) -> dict[str, Any]:
    """Return a technical provider/generation failure, never a user outcome."""
    result = deepcopy(DEFAULT_RESPONSE)
    result["generation_error"] = str(reason)
    result["validation"] = {"valid": False, "errors": errors or [str(reason)]}
    return result


# Compatibility aliases for older callers during the staged migration.
normalize_response = normalize_plan
failure = generation_failure


def validate_automation_ir(automation: Any) -> dict[str, Any]:
    errors: list[str] = []
    if not isinstance(automation, dict):
        return {"valid": False, "schema_version": AUTOMATION_IR_SCHEMA_VERSION, "errors": ["automation must be an object."]}

    for field in ("triggers", "conditions", "actions"):
        if not isinstance(automation.get(field), list):
            errors.append(f"{field} must be an array.")
    if "alias" in automation and not isinstance(automation["alias"], str):
        errors.append("alias must be a string when provided.")
    if isinstance(automation.get("triggers"), list):
        for index, item in enumerate(automation["triggers"]):
            if not isinstance(item, dict):
                errors.append(f"triggers[{index}] must be an object.")
            elif not isinstance(item.get("trigger"), str) or not item["trigger"].strip():
                errors.append(f"triggers[{index}] must use the normalized trigger field, not platform.")
    def validate_action(item, path):
        if not isinstance(item, dict):
            errors.append(f"{path} must be an object.")
        elif "delay" in item:
            if not isinstance(item["delay"], (str, int, float, dict)):
                errors.append(f"{path}.delay has an invalid duration.")
        elif "choose" in item:
            if not isinstance(item["choose"], list):
                errors.append(f"{path}.choose must be an array.")
            else:
                for index, choice in enumerate(item["choose"]):
                    if not isinstance(choice, dict) or not isinstance(choice.get("sequence"), list):
                        errors.append(f"{path}.choose[{index}] requires a sequence array.")
                    else:
                        for child_index, child in enumerate(choice["sequence"]):
                            validate_action(child, f"{path}.choose[{index}].sequence[{child_index}]")
                for index, child in enumerate(as_list(item.get("default"))):
                    validate_action(child, f"{path}.default[{index}]")
        elif not isinstance(item.get("action"), str) or not item["action"].strip():
            errors.append(f"{path} must use the normalized action field.")
    if isinstance(automation.get("actions"), list):
        for index, item in enumerate(automation["actions"]):
            validate_action(item, f"actions[{index}]")
    return {"valid": not errors, "schema_version": AUTOMATION_IR_SCHEMA_VERSION, "errors": errors}
