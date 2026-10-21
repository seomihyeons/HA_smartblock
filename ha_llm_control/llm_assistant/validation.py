"""Local grounding and safety validation for provider output."""

from __future__ import annotations

from typing import Any

import yaml

from .context import normalize_capabilities, normalize_entity_cards
from .contracts import (
    INTENT_AUTOMATION,
    INTENT_CONTROL,
    INTENT_INFORMATION,
    OPERATION_ENTITY_COLLECTION,
    OPERATION_ENTITY_PROPERTY,
    OPERATION_SERVICE_CONTROL,
    generation_failure,
    normalize_plan,
    normalize_to_automation_ir,
    validate_automation_ir,
)


def _entity_ids(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str)]
    return []


def _action_service(action: dict[str, Any]) -> str:
    return str(action.get("action") or action.get("service") or "").strip()


def _parse_single_automation_yaml(source: str) -> dict[str, Any]:
    """Parse exactly one automation document without ever executing YAML tags."""
    try:
        documents = [item for item in yaml.safe_load_all(source) if item is not None]
    except yaml.YAMLError as exc:
        raise ValueError("The generated YAML could not be parsed.") from exc
    if len(documents) != 1:
        raise ValueError("The response must contain exactly one YAML document.")

    document = documents[0]
    # Both a single automation mapping and the common `- alias: ...` export
    # form describe one automation.  Multiple items remain intentionally
    # rejected: one request must not silently create several rules.
    if isinstance(document, list):
        if len(document) != 1:
            raise ValueError("The response must describe exactly one automation.")
        document = document[0]
    if not isinstance(document, dict):
        raise ValueError("The YAML automation must be a mapping.")
    return document


def validate_response(response: Any, home_context: Any) -> dict[str, Any]:
    """Validate a model plan without assigning a user-facing outcome.

    Validation failures are generation failures.  The Node/HA boundary later
    distinguishes a missing entity, unsupported capability, and an incomplete
    user request using live Home Assistant context.
    """
    result = normalize_plan(response)
    if not result["validation"].get("valid"):
        return result

    if result.get("missing_fields"):
        return result

    source = home_context if isinstance(home_context, dict) else {}
    if result["intent"] == INTENT_CONTROL:
        plan = result["plan"]
        effect = plan.get("effect") if isinstance(plan.get("effect"), dict) else {}
        target = plan.get("target") if isinstance(plan.get("target"), dict) else {}
        service = str(effect.get("service") or "").strip()
        operation = str(plan.get("operation") or "").strip()
        errors: list[str] = []
        if operation != OPERATION_SERVICE_CONTROL:
            errors.append("A control plan must use the service_control operation.")
        if not service:
            errors.append("A control plan must include effect.service.")
        if not isinstance(effect.get("data", {}), dict):
            errors.append("Control effect.data must be an object.")
        selector = str(target.get("selector") or "").strip()
        if selector not in {"entity", "entity_filter", "unresolved"}:
            errors.append("A control target must use entity, entity_filter, or unresolved selection.")
        if selector == "entity" and not str(target.get("entity_id") or "").strip():
            errors.append("An entity target must include entity_id.")
        if selector == "entity_filter" and not isinstance(target.get("filter", {}), dict):
            errors.append("An entity_filter target must include an object filter.")
        if selector == "entity_filter" and str(target.get("scope") or "").strip() != "collection":
            errors.append("A control entity_filter target must declare collection scope.")
        if selector == "entity_filter" and not str(target.get("scope_reference") or "").strip():
            errors.append("A control entity_filter target must include scope_reference.")
        if selector == "unresolved" and not str(target.get("reference") or "").strip():
            errors.append("An unresolved control target must include reference.")
        if errors:
            result["validation"] = {"valid": False, "errors": errors}
            return result
        result["validation"] = {"valid": True, "errors": [], "schema_version": None, "normalizations": []}
        return result

    if result["intent"] == INTENT_INFORMATION:
        plan = result["plan"]
        errors: list[str] = []
        operation = str(plan.get("operation") or "").strip()
        target = plan.get("target") if isinstance(plan.get("target"), dict) else {}
        selector = str(target.get("selector") or "").strip()
        if operation not in {OPERATION_ENTITY_PROPERTY, OPERATION_ENTITY_COLLECTION}:
            errors.append("An information plan must use entity_property or entity_collection.")
        if selector not in {"entity", "entity_filter", "unresolved"}:
            errors.append("An information target must use entity, entity_filter, or unresolved selection.")
        if selector == "entity" and not str(target.get("entity_id") or "").strip():
            errors.append("An entity target must include entity_id.")
        if selector == "entity_filter" and not isinstance(target.get("filter", {}), dict):
            errors.append("An entity_filter target must include an object filter.")
        if selector == "unresolved" and not str(target.get("reference") or "").strip():
            errors.append("An unresolved information target must include reference.")
        if operation == OPERATION_ENTITY_PROPERTY and not str(plan.get("property") or "").strip():
            errors.append("An entity_property plan must include property.")
        if operation == OPERATION_ENTITY_COLLECTION:
            projection = plan.get("projection", [])
            if not isinstance(projection, list) or not all(isinstance(item, str) for item in projection):
                errors.append("entity_collection projection must be a string array.")
        if errors:
            result["validation"] = {"valid": False, "errors": errors}
            return result
        result["validation"] = {"valid": True, "errors": [], "schema_version": None, "normalizations": []}
        return result

    if result["intent"] != INTENT_AUTOMATION:
        result["validation"] = {"valid": True, "errors": []}
        return result

    try:
        parsed_yaml = _parse_single_automation_yaml(str(result["plan"].get("yaml") or ""))
    except ValueError as exc:
        return generation_failure(str(exc))

    normalized = normalize_to_automation_ir(parsed_yaml)
    if normalized["conflicts"]:
        return generation_failure("The automation contains conflicting compatibility aliases.", errors=normalized["conflicts"])
    result["automation"] = normalized["automation"]
    ir_result = validate_automation_ir(result["automation"])
    if not ir_result["valid"]:
        return generation_failure("The automation did not match the Automation IR contract.", errors=ir_result["errors"])

    cards = {card["entity_id"]: card for card in normalize_entity_cards(source.get("entity_cards") or source.get("entities"))}
    capabilities = normalize_capabilities(source.get("capabilities"))
    errors: list[str] = []
    automation = result["automation"]

    resolved_ids = {
        str(item.get("entity_id"))
        for item in source.get("entity_resolution", []) if isinstance(item, dict)
        and item.get("status") == "resolved" and item.get("entity_id")
    }
    referenced_ids: set[str] = set()

    contract = source.get("automation_dialect_contract") or {}
    trigger_kinds = set(contract.get("trigger_kinds") or ["state", "numeric_state", "time", "time_pattern", "sun", "homeassistant", "event", "mqtt", "template"])
    condition_kinds = set(contract.get("condition_kinds") or ["state", "numeric_state", "time", "sun", "template", "and", "or", "not", "zone.in_zone", "zone.not_in_zone"])
    structures = set(contract.get("action_structures") or ["service", "delay", "choose"])

    def references(node, path):
        if isinstance(node, list):
            for index, child in enumerate(node):
                references(child, f"{path}[{index}]")
        elif isinstance(node, dict):
            for key, child in node.items():
                if key == "entity_id":
                    for entity_id in _entity_ids(child):
                        referenced_ids.add(entity_id)
                        if entity_id not in cards:
                            errors.append(f"{path} references an entity outside Home Assistant context: {entity_id}")
                references(child, f"{path}.{key}")

    def condition(node, path):
        if isinstance(node, str):
            if "template" not in condition_kinds:
                errors.append(f"{path} uses an unsupported template condition.")
            return
        if not isinstance(node, dict):
            errors.append(f"{path} must be a condition object.")
            return
        for logic in ("and", "or", "not"):
            if logic in node:
                if logic not in condition_kinds or not isinstance(node[logic], list):
                    errors.append(f"{path} has an unsupported logical condition.")
                    return
                for index, child in enumerate(node[logic]):
                    condition(child, f"{path}.{logic}[{index}]")
                return
        kind = str(node.get("condition") or "")
        if kind not in condition_kinds:
            errors.append(f"{path} uses a condition kind outside capability context: {kind}")
        for index, child in enumerate(node.get("conditions") or []):
            condition(child, f"{path}.conditions[{index}]")

    def action(node, path):
        if "delay" in node:
            if "delay" not in structures:
                errors.append(f"{path} uses an unsupported delay.")
            return
        if "choose" in node:
            if "choose" not in structures:
                errors.append(f"{path} uses an unsupported choose.")
            for index, choice in enumerate(node["choose"]):
                for child_index, child in enumerate(choice.get("conditions") or []):
                    condition(child, f"{path}.choose[{index}].conditions[{child_index}]")
                for child_index, child in enumerate(choice.get("sequence") or []):
                    action(child, f"{path}.choose[{index}].sequence[{child_index}]")
            for index, child in enumerate(node.get("default") or []):
                action(child, f"{path}.default[{index}]")
            return
        service = _action_service(node)
        if "service" not in structures or service not in capabilities:
            errors.append(f"{path} uses a service outside capability context: {service or '(missing)'}")
            return
        target = node.get("target") if isinstance(node.get("target"), dict) else {}
        target_ids = _entity_ids(target.get("entity_id"))
        if capabilities[service]["target_required"] and not target_ids:
            errors.append(f"{path} requires a grounded target entity.")
        for entity_id in target_ids:
            if entity_id in cards and service not in cards[entity_id]["supported_actions"]:
                errors.append(f"{path} service {service} is not supported by {entity_id}")

    references(automation, "automation")
    for index, trigger in enumerate(automation["triggers"]):
        if trigger.get("trigger") not in trigger_kinds:
            errors.append(f"triggers[{index}] uses a trigger kind outside capability context: {trigger.get('trigger')}")
    for index, node in enumerate(automation["conditions"]):
        condition(node, f"conditions[{index}]")
    for index, node in enumerate(automation["actions"]):
        action(node, f"actions[{index}]")

    for entity_id in sorted(resolved_ids - referenced_ids):
        errors.append(f"The generated automation omitted a server-resolved entity: {entity_id}")

    if errors:
        result["validation"] = {"valid": False, "errors": errors}
        result["plan"]["automation"] = result["automation"]
        return result
    # Keep the original YAML as the LLM artifact, and expose a deterministic
    # current-dialect rendering separately for consumers that need it.
    result["normalized_yaml"] = yaml.safe_dump(
        result["automation"], allow_unicode=True, sort_keys=False, default_flow_style=False,
    )
    result["validation"] = {
        "valid": True,
        "blockly_supported": False,
        "requires_host_validation": True,
        "errors": [],
        "schema_version": ir_result["schema_version"],
        "normalizations": normalized["normalizations"],
    }
    result["plan"]["automation"] = result["automation"]
    result["plan"]["normalized_yaml"] = result["normalized_yaml"]
    return result
