"""Provider-neutral automation drafting orchestration."""

from __future__ import annotations

import json
from time import perf_counter
from typing import Any, Callable

from .context import public_context
from .contracts import failure
from .provider import ProviderError, request_text
from .validation import validate_response


SYSTEM_PROMPT = """You are a bounded smart-home request planner. You never execute, save, deploy, or modify Home Assistant.

The request payload contains a user request, Home Assistant entity metadata,
service metadata, and an automation_dialect_contract.  Use only entity IDs,
services, service fields, and YAML syntax advertised in that supplied context.
Do not infer unavailable entities, device IDs, area IDs, attributes, states,
values, targets, services, or service-data fields.

`home_context.candidates` is a server-side retrieval result over the live
EntityCards.  Its method and ranked evidence are in `home_context.retrieval`.
Treat it as candidate evidence, not as permission to invent a target.  Treat
natural variations in whitespace, punctuation, case, and identifier separators
as the same name.  If one candidate is a clearly more specific match, use it;
do not ask a user for an entity ID merely because they used a natural-language
name. Ask a target clarification only when no candidate matches or two or more
candidates remain equally plausible.

`home_context.resolved_entity_references` contains maximal exact name matches
after separator-insensitive normalization.  Each such match is deterministic
grounding evidence, not a guessed target.  Use it for the corresponding part
of the request; do not ask for that entity again.  Ask only for a genuinely
unresolved required reference.

`home_context.entity_resolution` is the server-side binding contract. Every
entry with status `resolved` must appear in the generated YAML for the
corresponding request; never ask for it again and never replace it with a
different entity.  The server returns ambiguous display-name collisions before
this model is called.

Return exactly one JSON response envelope and no Markdown or code fence.
Choose exactly one intent:
- automation: a persistent rule with a trigger, condition, time, or event;
- control: an explicit request to change one device state now;
- information: a request to read current Home Assistant state;
- goal_or_routine: an under-specified desired outcome requiring clarification;
- no_match: the requested target or capability is not present in supplied context;
- unsupported: the request is outside the supplied dialect or safety scope.

Choose exactly one status:
- success: one unambiguous, supported automation can be created;
- needs_clarification or needs_confirmation: a required trigger, target,
  state, value, or other semantic detail is missing or ambiguous;
- unsupported: the requested feature is outside automation_dialect_contract;
- no_match: no supplied entity or capability is relevant to a requested target;
- failure: only when no safe response can be produced.

For automation with success, make the YAML use the root keys and trigger, condition, action,
and service-data syntax advertised by automation_dialect_contract.  For
example, use `trigger: state` only when the selected trigger is a state
trigger and that syntax is advertised.  Do not include explanations,
comments, Markdown, or a guessed target/action in the YAML.

For control with success, return `service` and `entity_id` only. They must be
supplied in Home Assistant context. Do not return YAML. A server policy will
independently validate and decide whether to preview or execute the call.

For information, do not invent state. Return unsupported unless the requested
read-only result is explicitly present in supplied context.

For no_match, explain that no matching entity or capability was found. Never
suggest an unrelated candidate merely because it shares a service capability.

Automation envelope: {\"intent\":\"automation\",\"status\":\"success\",\"yaml\":\"alias: Example\\ntriggers: []\\nconditions: []\\nactions: []\\n\",\"question\":\"\",\"reason\":\"\"}
Control envelope: {\"intent\":\"control\",\"status\":\"success\",\"service\":\"light.turn_on\",\"entity_id\":\"light.example\",\"yaml\":\"\",\"question\":\"\",\"reason\":\"\"}
Clarification envelope: {\"intent\":\"goal_or_routine\",\"status\":\"needs_clarification\",\"yaml\":\"\",\"question\":\"What outcome should be automated?\",\"reason\":\"\"}
No-match envelope: {\"intent\":\"no_match\",\"status\":\"no_match\",\"yaml\":\"\",\"question\":\"\",\"reason\":\"No matching entity is available in the current Home Assistant context.\"}
"""


def _extract_json(raw: str) -> dict[str, Any]:
    text = str(raw or "").strip()
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("Provider response did not contain a JSON object.")
        value = json.loads(text[start : end + 1])
    if not isinstance(value, dict):
        raise ValueError("Provider response was not a JSON object.")
    return value


def _default_client_factory(provider: str | None):
    from ha_llm_control.llm_api.factory import get_llm_client
    return get_llm_client(provider=provider)


def create_assistant_response(
    payload: dict[str, Any],
    *,
    client_factory: Callable[[str | None], Any] = _default_client_factory,
) -> dict[str, Any]:
    command = str(payload.get("command") or "").strip()
    if not command:
        return failure("command is required")

    provider = str(payload.get("provider") or "").strip().lower() or None
    context = public_context(payload.get("home_context"), command)
    request = {
        "command": command,
        "conversation": payload.get("conversation") if isinstance(payload.get("conversation"), list) else [],
        "home_context": context,
    }
    pipeline_started = perf_counter()
    max_tokens = payload.get("max_tokens", 1200)
    attempts = 0
    try:
        attempts += 1
        reply = request_text(
            provider=provider,
            prompt=json.dumps(request, ensure_ascii=False, separators=(",", ":")),
            system_prompt=SYSTEM_PROMPT,
            max_tokens=max_tokens,
            client_factory=client_factory,
        )
        generated = _extract_json(reply.text)
    except (ProviderError, ValueError) as exc:
        return failure(str(exc))

    validation_context = {
        "entity_cards": context["entity_cards"],
        "capabilities": context["capabilities"],
        "automation_dialect_contract": context["automation_dialect_contract"],
        "entity_resolution": context["entity_resolution"],
    }
    result = validate_response(generated, validation_context)
    # A single repair is allowed only for malformed or locally-invalid success output.
    if result["status"] == "failure":
        repair_errors = result.get("validation", {}).get("errors", [])
        repair_prompt = {
            "original_request": request,
            "invalid_response": generated,
            "validation_errors": repair_errors,
            "instruction": "Return one corrected response envelope only. On success, correct the YAML string; do not add explanations.",
        }
        try:
            attempts += 1
            reply = request_text(
                provider=provider,
                prompt=json.dumps(repair_prompt, ensure_ascii=False, separators=(",", ":")),
                system_prompt=SYSTEM_PROMPT,
                max_tokens=max_tokens,
                client_factory=client_factory,
            )
            generated = _extract_json(reply.text)
            result = validate_response(generated, validation_context)
        except (ProviderError, ValueError) as exc:
            result = failure(str(exc))

    result["metrics"] = {
        "provider": reply.provider if "reply" in locals() else (provider or "default"),
        "model": reply.model if "reply" in locals() else "unknown",
        "last_request_latency_ms": reply.latency_ms if "reply" in locals() else 0,
        "total_latency_ms": round((perf_counter() - pipeline_started) * 1000, 2),
        "attempts": attempts,
        "candidate_entities": len(context["candidates"]),
        "retrieval_method": context.get("retrieval", {}).get("method"),
    }
    return result
