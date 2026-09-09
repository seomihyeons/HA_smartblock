"""Home-context normalization and deterministic, domain-agnostic retrieval."""

from __future__ import annotations

import re
from typing import Any


def text(value: Any) -> str:
    return str(value or "").strip()


def tokens(value: Any) -> set[str]:
    normalized = re.sub(r"[_./-]+", " ", text(value).lower())
    return {token for token in re.findall(r"[a-z0-9가-힣]+", normalized) if len(token) > 1}


def compact(value: Any) -> str:
    """Compare display names independent of whitespace and identifier separators."""
    return "".join(re.findall(r"[a-z0-9가-힣]+", text(value).lower()))


def compact_ngrams(value: Any, *, maximum: int = 6) -> set[str]:
    parts = re.findall(r"[a-z0-9가-힣]+", text(value).lower())
    values: set[str] = set()
    for start in range(len(parts)):
        for end in range(start + 1, min(len(parts), start + maximum) + 1):
            values.add("".join(parts[start:end]))
    return values


def normalize_entity_cards(value: Any) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    for raw in value if isinstance(value, list) else []:
        if not isinstance(raw, dict):
            continue
        entity_id = text(raw.get("entity_id"))
        domain = text(raw.get("domain")) or entity_id.partition(".")[0]
        if not entity_id or not domain:
            continue
        cards.append({
            "entity_id": entity_id,
            "domain": domain,
            "friendly_name": text(raw.get("friendly_name")) or entity_id,
            "state": raw.get("state"),
            "device_class": text(raw.get("device_class")) or None,
            "area": text(raw.get("area")) or None,
            "capabilities": sorted({text(item) for item in raw.get("capabilities", []) if text(item)}),
            "supported_actions": sorted({text(item) for item in raw.get("supported_actions", []) if text(item)}),
        })
    return cards


def normalize_capabilities(value: Any) -> dict[str, dict[str, Any]]:
    services = value.get("services", []) if isinstance(value, dict) else []
    result: dict[str, dict[str, Any]] = {}
    for item in services:
        service = {"id": item, "risk": "medium", "target_required": True} if isinstance(item, str) else item
        if not isinstance(service, dict) or not text(service.get("id")):
            continue
        service_id = text(service["id"])
        result[service_id] = {
            "id": service_id,
            "risk": text(service.get("risk")) or "medium",
            "target_required": service.get("target_required") is not False,
        }
    return result


def retrieve_candidates(command: str, entity_cards: list[dict[str, Any]], *, limit: int = 24) -> list[dict[str, Any]]:
    """Rank Cards from their own names and IDs; no room/device alias dictionary is used."""
    query_tokens = tokens(command)
    query_compact_ngrams = compact_ngrams(command)
    ranked: list[tuple[int, str, dict[str, Any]]] = []
    for card in entity_cards:
        card_tokens = tokens(
            f"{card['entity_id']} {card['friendly_name']} {card['domain']} "
            f"{card.get('area') or ''} {card.get('device_class') or ''}"
        )
        overlap = query_tokens & card_tokens
        score = len(overlap) * 3
        friendly = text(card["friendly_name"]).lower()
        if friendly and friendly in text(command).lower():
            score += 8
        if card["entity_id"].split(".", 1)[-1].replace("_", " ") in text(command).lower():
            score += 5
        # A normal user phrase such as "living room light" must match an
        # entity label such as "Livingroom Light" without an alias table.
        # Longer exact phrase matches win over their substrings (e.g. "Room
        # Light"), making the policy deterministic and domain-agnostic.
        # A display name and an entity-id tail often normalize to the same
        # phrase.  Score that phrase once, otherwise naming conventions would
        # accidentally double its influence.
        for normalized_label in {
            compact(card["friendly_name"]),
            compact(card["entity_id"].split(".", 1)[-1]),
        }:
            if normalized_label and normalized_label in query_compact_ngrams:
                # Exact compact phrase equality is stronger evidence than a
                # shorter substring that happened to retain whitespace.
                score += 40 + (4 * len(normalized_label))
        if score:
            ranked.append((score, card["entity_id"], card))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    return [card for _, _, card in ranked[:limit]]


def resolved_entity_references(command: str, entity_cards: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Return maximal exact name matches after separator-insensitive normalization.

    This is deterministic EntityCard grounding, not a room or device alias
    dictionary.  A shorter match is discarded when it is merely a substring of
    a more specific match in the same request (``room light`` versus
    ``living room light``).
    """
    phrases = compact_ngrams(command)
    query_tokens = tokens(command)
    matches: list[tuple[str, dict[str, str]]] = []
    for card in entity_cards:
        name = compact(card["friendly_name"])
        entity_tail = compact(card["entity_id"].split(".", 1)[-1])
        matched = name if name in phrases else entity_tail if entity_tail in phrases else ""
        if matched:
            matches.append((matched, {
                "entity_id": card["entity_id"],
                "friendly_name": card["friendly_name"],
                "matched_name": matched,
                "evidence": "normalized_exact_name",
            }))
            continue

        # A device can also be unambiguous when the request names one of its
        # descriptive tokens and its advertised device class.  For example,
        # a card named "PIR (Entrance)" with device_class "motion" is grounded
        # by "entrance motion" without a domain-specific synonym table.
        device_class = text(card.get("device_class")).lower()
        name_tokens = tokens(f"{card['friendly_name']} {card['entity_id']}")
        shared_name_tokens = query_tokens & name_tokens
        if device_class and device_class in query_tokens and shared_name_tokens:
            matched = max(shared_name_tokens, key=len)
            matches.append((matched, {
                "entity_id": card["entity_id"],
                "friendly_name": card["friendly_name"],
                "matched_name": matched,
                "evidence": "name_and_device_class",
            }))
    maximal = [
        item for item in matches
        if not any(item[0] != other[0] and item[0] in other[0] for other in matches)
    ]
    maximal.sort(key=lambda item: (-len(item[0]), item[1]["entity_id"]))
    return [item for _, item in maximal]


def _host_candidates(source: dict[str, Any], cards: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """Use a host retrieval result when available.

    The Node/HA boundary owns retrieval because it has the complete, live
    EntityCard set.  This private service deliberately does not repeat that
    ranking with a second, diverging set of per-home heuristics.
    """
    retrieval = source.get("retrieval")
    if not isinstance(retrieval, dict):
        return [], None
    requested_ids = retrieval.get("candidate_entity_ids")
    if not isinstance(requested_ids, list) or not requested_ids:
        return [], None
    by_id = {card["entity_id"]: card for card in cards}
    selected = [by_id[entity_id] for entity_id in requested_ids if entity_id in by_id]
    if not selected:
        return [], None
    return selected, {
        "method": text(retrieval.get("method")) or "host",
        "fallback": retrieval.get("fallback") is True,
        "embedding_model": text(retrieval.get("embedding_model")) or None,
        "ranking": retrieval.get("ranking") if isinstance(retrieval.get("ranking"), list) else [],
    }


def normalize_entity_resolution(value: Any, cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep only host resolution evidence tied to supplied live EntityCards."""
    known_ids = {card["entity_id"] for card in cards}
    result: list[dict[str, Any]] = []
    for item in value if isinstance(value, list) else []:
        if not isinstance(item, dict):
            continue
        reference = text(item.get("reference"))
        status = text(item.get("status"))
        if not reference or status not in {"resolved", "ambiguous", "unresolved"}:
            continue
        if status == "resolved" and text(item.get("entity_id")) in known_ids:
            result.append({
                "reference": reference,
                "status": status,
                "entity_id": text(item.get("entity_id")),
                "evidence": text(item.get("evidence")) or "host_resolution",
            })
        elif status != "resolved":
            result.append({
                "reference": reference,
                "status": status,
                "evidence": text(item.get("evidence")) or "host_resolution",
            })
    return result


def public_context(home_context: Any, command: str) -> dict[str, Any]:
    source = home_context if isinstance(home_context, dict) else {}
    cards = normalize_entity_cards(source.get("entity_cards") or source.get("entities"))
    capabilities = normalize_capabilities(source.get("capabilities"))
    candidates, retrieval_metadata = _host_candidates(source, cards)
    if not candidates:
        # Direct private-API users retain a deterministic lexical fallback.
        # Normal HA-SmartBlock traffic is ranked by server/entity_retriever.mjs.
        candidates = retrieve_candidates(command, cards, limit=16)
        retrieval_metadata = {"method": "private_lexical_fallback", "fallback": False, "ranking": []}
    resolved = resolved_entity_references(command, candidates)
    host_resolution = normalize_entity_resolution(source.get("entity_resolution"), cards)
    candidate_ids = {card["entity_id"] for card in candidates}
    card_by_id = {card["entity_id"]: card for card in cards}
    # The model receives only retrieval-scoped cards.  The previous full Home
    # Assistant state dump made exact grounding harder as installations grew.
    for reference in resolved:
        card = card_by_id.get(reference["entity_id"])
        if card and card["entity_id"] not in candidate_ids:
            candidates.append(card)
            candidate_ids.add(card["entity_id"])
    raw_capabilities = source.get("capabilities") if isinstance(source.get("capabilities"), dict) else {}

    def contract_list(key: str) -> list[str]:
        return sorted({text(item) for item in raw_capabilities.get(key, []) if text(item)})

    return {
        "entity_cards": candidates,
        "candidates": candidates,
        "resolved_entity_references": resolved,
        "entity_resolution": host_resolution,
        "slots": source.get("slots") if isinstance(source.get("slots"), dict) else {},
        "retrieval": retrieval_metadata,
        "capabilities": {"services": list(capabilities.values())},
        # This is supplied by the host application, rather than being baked
        # into the model prompt.  A different Home Assistant dialect or UI can
        # therefore advertise a different supported surface.
        "automation_dialect_contract": {
            "root_keys": ["alias", "triggers", "conditions", "actions"],
            "trigger_kinds": contract_list("trigger_kinds"),
            "condition_kinds": contract_list("condition_kinds"),
            "action_structures": contract_list("action_structures"),
        },
    }
