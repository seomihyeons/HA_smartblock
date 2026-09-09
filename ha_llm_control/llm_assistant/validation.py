"""Local grounding and safety validation for provider output."""

from __future__ import annotations

from typing import Any

import yaml

from .context import normalize_capabilities, normalize_entity_cards
from .contracts import (
    INTENT_AUTOMATION,
    INTENT_CONTROL,
    STATUS_SUCCESS,
    failure,
    normalize_response,
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
    result = normalize_response(response)
    if result["status"] != STATUS_SUCCESS:
        result["validation"] = {"valid": result["status"] != "failure", "errors": []}
        return result

    source = home_context if isinstance(home_context, dict) else {}
    if result["intent"] == INTENT_CONTROL:
        cards = {
            card["entity_id"]: card
            for card in normalize_entity_cards(source.get("entity_cards") or source.get("entities"))
        }
        capabilities = normalize_capabilities(source.get("capabilities"))
        card = cards.get(result["entity_id"])
        errors: list[str] = []
        if result["service"] not in capabilities:
            errors.append(f"The control service is outside capability context: {result['service'] or '(missing)'}")
        if not card:
            errors.append(f"The control entity is outside Home Assistant context: {result['entity_id'] or '(missing)'}")
        elif result["service"] not in card["supported_actions"]:
            errors.append(f"The control service {result['service']} is not supported by {result['entity_id']}")
        resolved_ids = {
            str(item.get("entity_id"))
            for item in source.get("entity_resolution", []) if isinstance(item, dict)
            and item.get("status") == "resolved" and item.get("entity_id")
        }
        if resolved_ids and result["entity_id"] not in resolved_ids:
            errors.append("The control entity conflicts with a server-resolved entity reference.")
        if errors:
            return failure("The requested control failed local grounding validation.", errors=errors)
        result["validation"] = {"valid": True, "errors": [], "schema_version": None, "normalizations": []}
        return result

    if result["intent"] != INTENT_AUTOMATION:
        result["validation"] = {"valid": True, "errors": []}
        return result

    try:
        parsed_yaml = _parse_single_automation_yaml(result["yaml"])
    except ValueError as exc:
        return failure(str(exc))

    normalized = normalize_to_automation_ir(parsed_yaml)
    if normalized["conflicts"]:
        return failure("The automation contains conflicting compatibility aliases.", errors=normalized["conflicts"])
    result["automation"] = normalized["automation"]
    ir_result = validate_automation_ir(result["automation"])
    if not ir_result["valid"]:
        return failure("The automation did not match the Automation IR contract.", errors=ir_result["errors"])

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

    for section in ("triggers", "conditions"):
        for index, item in enumerate(automation.get(section, [])):
            if not isinstance(item, dict):
                continue
            for entity_id in _entity_ids(item.get("entity_id")):
                referenced_ids.add(entity_id)
                if entity_id not in cards:
                    errors.append(f"{section}[{index}] references an entity outside Home Assistant context: {entity_id}")

    for index, action in enumerate(automation.get("actions", [])):
        if not isinstance(action, dict):
            continue
        service = _action_service(action)
        if service not in capabilities:
            errors.append(f"actions[{index}] uses a service outside capability context: {service or '(missing)'}")
            continue
        target = action.get("target") if isinstance(action.get("target"), dict) else {}
        target_ids = _entity_ids(target.get("entity_id"))
        if capabilities[service]["target_required"] and not target_ids:
            errors.append(f"actions[{index}] requires a grounded target entity.")
        for entity_id in target_ids:
            referenced_ids.add(entity_id)
            card = cards.get(entity_id)
            if not card:
                errors.append(f"actions[{index}] targets an entity outside Home Assistant context: {entity_id}")
            elif service not in card["supported_actions"]:
                errors.append(f"actions[{index}] service {service} is not supported by {entity_id}")

    for entity_id in sorted(resolved_ids - referenced_ids):
        errors.append(f"The generated automation omitted a server-resolved entity: {entity_id}")

    if errors:
        return failure("The generated automation failed local grounding validation.", errors=errors)
    # Keep the original YAML as the LLM artifact, and expose a deterministic
    # current-dialect rendering separately for consumers that need it.
    result["normalized_yaml"] = yaml.safe_dump(
        result["automation"], allow_unicode=True, sort_keys=False, default_flow_style=False,
    )
    result["validation"] = {
        "valid": True,
        "errors": [],
        "schema_version": ir_result["schema_version"],
        "normalizations": normalized["normalizations"],
    }
    return result
