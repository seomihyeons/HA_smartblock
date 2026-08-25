import { randomUUID } from "node:crypto";

const ALLOWED_SERVICES = new Set(["light.turn_on", "light.turn_off"]);
const LIGHT_WORD_RE = /(?:\blights?\b|\blamps?\b|조명|전등|램프|불)/iu;
const TURN_ON_RE = /(?:\bturn\s+on\b|\bswitch\s+on\b|\blights?\s+on\b|켜\s*(?:줘|주세요|줘요|라)?)/iu;
const TURN_OFF_RE = /(?:\bturn\s+off\b|\bswitch\s+off\b|\blights?\s+off\b|꺼\s*(?:줘|주세요|줘요|라)?|끄\s*(?:어|어줘|세요|어주세요)?)/iu;
const AUTOMATION_RE = /(?:\bwhen(?:ever)?\b|\bif\b|\bafter\b|\bbefore\b|\bschedule\b|\bautomat(?:e|ion)\b|자동화|예약|되면|할\s*때|감지.*(?:면|때))/iu;
const LOCALIZED_ROOM_TERMS = [
  { request: /거실/u, entity: /(?:living\s*room|livingroom|lounge)/u },
  { request: /(?:주방|부엌)/u, entity: /kitchen/u },
  { request: /(?:현관|입구)/u, entity: /(?:entrance|entry|foyer)/u },
  { request: /(?:욕실|화장실)/u, entity: /(?:bath\s*room|bathroom|toilet)/u },
  { request: /침실/u, entity: /(?:bed\s*room|bedroom)/u },
  { request: /방/u, entity: /(?:^|\s)room(?:\s|$)/u },
];

export class ControlNowError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "ControlNowError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function normalized(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[_-]+/g, " ").trim();
}

function allowedLights(cards) {
  return (Array.isArray(cards) ? cards : []).filter((card) => {
    const entityId = String(card?.entity_id || "");
    const actions = Array.isArray(card?.supported_actions) ? card.supported_actions : [];
    return card?.domain === "light"
      && entityId.startsWith("light.")
      && actions.some((action) => ALLOWED_SERVICES.has(action));
  });
}

function parseExplicitCommand(command) {
  const text = String(command || "").trim();
  if (!text) throw new ControlNowError("missing_command", "Enter an explicit light control request.");
  if (AUTOMATION_RE.test(text)) {
    throw new ControlNowError("not_immediate", "Control now only accepts explicit immediate requests, not automation rules.");
  }
  const on = TURN_ON_RE.test(text);
  const off = TURN_OFF_RE.test(text);
  if (on === off) {
    throw new ControlNowError("missing_explicit_action", "Explicitly ask to turn a light on or off.");
  }
  return { text, service: on ? "light.turn_on" : "light.turn_off" };
}

function scoreCard(command, card) {
  const text = normalized(command);
  const entityId = normalized(card.entity_id);
  const objectId = normalized(String(card.entity_id).split(".").slice(1).join("."));
  const name = normalized(card.friendly_name);
  const area = normalized(card.area);
  const entityText = `${entityId} ${objectId} ${name} ${area}`;
  if (text.includes(entityId)) return 100;
  if (objectId && text.includes(objectId)) return 80;
  if (name && name.length > 1 && text.includes(name)) return 60;
  if (area && area.length > 1 && text.includes(area)) return 40;
  if (LOCALIZED_ROOM_TERMS.some(({ request, entity }) => request.test(text) && entity.test(entityText))) {
    return 35;
  }
  return 0;
}

function candidatesFor(command, cards) {
  const scored = cards.map((card) => ({ card, score: scoreCard(command, card) }));
  const best = Math.max(0, ...scored.map(({ score }) => score));
  if (best > 0) return scored.filter(({ score }) => score === best).map(({ card }) => card);
  if (LIGHT_WORD_RE.test(command)) return cards;
  return [];
}

function publicCandidate(card) {
  return {
    entity_id: card.entity_id,
    name: card.friendly_name || card.entity_id,
    area: card.area || null,
  };
}

export function createControlNowService({
  fetchEntityCards,
  callLightService,
  now = () => Date.now(),
  createId = () => randomUUID(),
  ttlMs = 60_000,
}) {
  if (typeof fetchEntityCards !== "function" || typeof callLightService !== "function") {
    throw new TypeError("Control now requires entity and service adapters");
  }
  const pending = new Map();

  function prune() {
    const time = now();
    for (const [id, item] of pending) {
      if (item.expiresAt <= time || item.used) pending.delete(id);
    }
  }

  async function preview({ command, selected_entity_id: selectedEntityId } = {}) {
    prune();
    const parsed = parseExplicitCommand(command);
    const lights = allowedLights(await fetchEntityCards())
      .filter((card) => card.supported_actions.includes(parsed.service));
    if (!lights.length) {
      throw new ControlNowError("no_supported_lights", "No compatible Home Assistant light entities are available.");
    }

    const candidates = candidatesFor(parsed.text, lights);
    if (!candidates.length) {
      throw new ControlNowError("unsupported_target", "Control now supports only a light that can be identified from Home Assistant.");
    }

    let target;
    if (selectedEntityId) {
      target = candidates.find((card) => card.entity_id === selectedEntityId);
      if (!target) {
        throw new ControlNowError("invalid_selection", "The selected light is no longer an eligible candidate.");
      }
    } else if (candidates.length === 1) {
      [target] = candidates;
    } else {
      return {
        status: "needs_confirmation",
        question: "Which Home Assistant light should be controlled?",
        service: parsed.service,
        candidates: candidates.map(publicCandidate),
      };
    }

    const executionId = createId();
    pending.set(executionId, {
      service: parsed.service,
      entityId: target.entity_id,
      expiresAt: now() + ttlMs,
      used: false,
    });
    return {
      status: "ready_to_execute",
      execution_id: executionId,
      expires_in_ms: ttlMs,
      service: parsed.service,
      entity: publicCandidate(target),
    };
  }

  async function execute({ execution_id: executionId } = {}) {
    const item = pending.get(String(executionId || ""));
    if (!item) throw new ControlNowError("invalid_or_used_preview", "This preview is invalid, expired, or already used.", 409);
    if (item.used || item.expiresAt <= now()) {
      pending.delete(String(executionId));
      throw new ControlNowError("invalid_or_used_preview", "This preview is invalid, expired, or already used.", 409);
    }

    item.used = true;
    const lights = allowedLights(await fetchEntityCards());
    const current = lights.find((card) => card.entity_id === item.entityId
      && card.supported_actions.includes(item.service));
    if (!current || !ALLOWED_SERVICES.has(item.service)) {
      throw new ControlNowError("entity_revalidation_failed", "The light is no longer available for this action.", 409);
    }

    await callLightService({ service: item.service, entity_id: item.entityId });
    return {
      status: "success",
      service: item.service,
      entity: publicCandidate(current),
    };
  }

  return { preview, execute };
}
