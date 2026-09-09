"""Small, provider-neutral contracts for the automation assistant API."""

from __future__ import annotations

from copy import deepcopy
from typing import Any


STATUS_SUCCESS = "success"
STATUS_NEEDS_CLARIFICATION = "needs_clarification"
STATUS_NEEDS_CONFIRMATION = "needs_confirmation"
STATUS_UNSUPPORTED = "unsupported"
STATUS_NO_MATCH = "no_match"
STATUS_FAILURE = "failure"
VALID_STATUSES = {
    STATUS_SUCCESS,
    STATUS_NEEDS_CLARIFICATION,
    STATUS_NEEDS_CONFIRMATION,
    STATUS_UNSUPPORTED,
    STATUS_NO_MATCH,
    STATUS_FAILURE,
}

INTENT_AUTOMATION = "automation"
INTENT_CONTROL = "control"
INTENT_INFORMATION = "information"
INTENT_GOAL_OR_ROUTINE = "goal_or_routine"
INTENT_NO_MATCH = "no_match"
INTENT_UNSUPPORTED = "unsupported"
VALID_INTENTS = {
    INTENT_AUTOMATION,
    INTENT_CONTROL,
    INTENT_INFORMATION,
    INTENT_GOAL_OR_ROUTINE,
    INTENT_NO_MATCH,
    INTENT_UNSUPPORTED,
}

AUTOMATION_IR_SCHEMA_VERSION = 1
DEFAULT_RESPONSE = {
    "intent": INTENT_AUTOMATION,
    "status": STATUS_FAILURE,
    "question": "",
    "reason": "",
    # `yaml` is the model's automation artifact.  `automation` is populated
    # only after the deterministic YAML parser/normalizer has accepted it.
    "yaml": "",
    "automation": None,
    "candidates": [],
    "service": "",
    "entity_id": "",
    "answer": "",
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

    automation["triggers"] = triggers
    automation["conditions"] = as_list(condition_source)
    automation["actions"] = actions
    automation.pop("trigger", None)
    automation.pop("condition", None)
    automation.pop("action", None)
    return {"automation": automation, "conflicts": conflicts, "normalizations": normalizations}


def normalize_response(value: Any) -> dict[str, Any]:
    out = deepcopy(DEFAULT_RESPONSE)
    if not isinstance(value, dict):
        out["reason"] = "The model response was not a JSON object."
        out["validation"] = {"valid": False, "errors": [out["reason"]]}
        return out

    intent = str(value.get("intent") or INTENT_AUTOMATION).strip()
    out["intent"] = intent if intent in VALID_INTENTS else INTENT_UNSUPPORTED
    status = str(value.get("status") or STATUS_FAILURE).strip()
    out["status"] = status if status in VALID_STATUSES else STATUS_FAILURE
    if status not in VALID_STATUSES:
        out["reason"] = "The model returned an unsupported status value."
    out["question"] = str(value.get("question") or "").strip()
    out["reason"] = str(value.get("reason") or out["reason"]).strip()
    out["yaml"] = value.get("yaml") if isinstance(value.get("yaml"), str) else ""
    out["candidates"] = [item for item in as_list(value.get("candidates")) if isinstance(item, dict)]
    out["service"] = str(value.get("service") or "").strip()
    out["entity_id"] = str(value.get("entity_id") or "").strip()
    out["answer"] = str(value.get("answer") or "").strip()
    if out["intent"] == INTENT_AUTOMATION and out["status"] == STATUS_SUCCESS and not out["yaml"].strip():
        out["status"] = STATUS_FAILURE
        out["reason"] = "A successful response must include one automation YAML document."
        out["validation"] = {"valid": False, "errors": [out["reason"]]}
    if out["intent"] == INTENT_CONTROL and out["status"] == STATUS_SUCCESS and (not out["service"] or not out["entity_id"]):
        out["status"] = STATUS_FAILURE
        out["reason"] = "A successful control response must include a service and entity_id."
        out["validation"] = {"valid": False, "errors": [out["reason"]]}
    if out["status"] == STATUS_FAILURE and not out["reason"]:
        out["reason"] = "The model did not produce a usable automation response."
        out["validation"] = {"valid": False, "errors": [out["reason"]]}
    return out


def failure(reason: str, *, errors: list[str] | None = None) -> dict[str, Any]:
    result = normalize_response({"status": STATUS_FAILURE, "reason": reason})
    result["validation"] = {"valid": False, "errors": errors or [reason]}
    return result


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
    if isinstance(automation.get("actions"), list):
        for index, item in enumerate(automation["actions"]):
            if not isinstance(item, dict):
                errors.append(f"actions[{index}] must be an object.")
            elif not isinstance(item.get("action"), str) or not item["action"].strip():
                errors.append(f"actions[{index}] must use the normalized action field.")
    return {"valid": not errors, "schema_version": AUTOMATION_IR_SCHEMA_VERSION, "errors": errors}
