const TURN_ON_RE = /(켜|켜줘|turn\s+on|switch\s+on)/i;
const MOTION_RE = /(움직임|움직|모션|motion|movement|presence)/i;

function text(value) {
  return String(value ?? '').trim();
}

function normalized(value) {
  return text(value)
    .toLocaleLowerCase()
    .replace(/[_\-.()/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueStrings(values) {
  return [...new Set((values || []).map(text).filter(Boolean))];
}

export function buildEntityCards(states) {
  if (!Array.isArray(states)) return [];

  return states.flatMap((state) => {
    if (!state || typeof state !== 'object') return [];
    const entityId = text(state.entity_id);
    if (!entityId.includes('.')) return [];
    const attributes = state.attributes && typeof state.attributes === 'object'
      ? state.attributes
      : {};
    const domain = entityId.split('.', 1)[0];

    return [{
      entity_id: entityId,
      friendly_name: text(attributes.friendly_name) || entityId,
      domain,
      state: state.state ?? null,
      device_class: text(attributes.device_class) || null,
      area: text(state.area || attributes.area) || null,
      capabilities: uniqueStrings([
        ...(Array.isArray(attributes.supported_color_modes)
          ? attributes.supported_color_modes
          : []),
      ]),
      supported_actions: domain === 'light'
        ? ['light.turn_on', 'light.turn_off']
        : [],
    }];
  });
}

function candidateText(card) {
  return normalized([
    card.entity_id,
    card.friendly_name,
    card.area,
    card.domain,
    card.device_class,
  ].filter(Boolean).join(' '));
}

function scoreCandidate(command, card, role) {
  const commandText = normalized(command);
  const haystack = candidateText(card);
  const entityTail = normalized(text(card.entity_id).split('.').slice(1).join(' '));
  const friendlyName = normalized(card.friendly_name);
  let score = 0;

  if (friendlyName && commandText.includes(friendlyName)) score += 10;
  if (entityTail && commandText.includes(entityTail)) score += 8;

  const commandTokens = new Set(commandText.split(' ').filter((token) => token.length > 1));
  for (const token of commandTokens) {
    if (haystack.includes(token)) score += 2;
  }

  if (role === 'trigger' && MOTION_RE.test(commandText)) {
    if (card.domain === 'binary_sensor') score += 3;
    if (normalized(card.device_class) === 'motion') score += 8;
    if (/(motion|pir|움직|모션)/i.test(haystack)) score += 5;
  }

  if (role === 'action' && TURN_ON_RE.test(commandText)) {
    if (card.domain === 'light') score += 5;
    if (/(light|lamp|조명|램프|무드)/i.test(haystack)) score += 4;
  }

  return score;
}

function rankedCandidates(command, cards, predicate, role) {
  return cards
    .filter(predicate)
    .map((card) => ({ card, score: scoreCandidate(command, card, role) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.card.entity_id.localeCompare(b.card.entity_id));
}

function resolveCandidate(command, candidates, selectedEntityId) {
  if (selectedEntityId) {
    return candidates.find(({ card }) => card.entity_id === selectedEntityId)?.card || null;
  }
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0].card;
  if (candidates[0].score > candidates[1].score) return candidates[0].card;
  return undefined;
}

function confirmation(role, candidates) {
  const label = role === 'trigger' ? '움직임 센서' : '조명';
  return {
    status: 'needs_confirmation',
    role,
    question: `어느 ${label}을 의미하나요?`,
    candidates: candidates.slice(0, 8).map(({ card, score }) => ({
      entity_id: card.entity_id,
      name: card.friendly_name || card.entity_id,
      area: card.area || null,
      score,
    })),
  };
}

export function validateDraft(automation, cards) {
  const errors = [];
  const entityIds = new Set(cards.map((card) => card.entity_id));
  const triggers = Array.isArray(automation?.triggers) ? automation.triggers : [];
  const actions = Array.isArray(automation?.actions) ? automation.actions : [];

  if (triggers.length !== 1) errors.push('MVP requires exactly one trigger.');
  if (actions.length !== 1) errors.push('MVP requires exactly one action.');

  const triggerEntityIds = Array.isArray(triggers[0]?.entity_id)
    ? triggers[0].entity_id
    : [triggers[0]?.entity_id].filter(Boolean);
  for (const entityId of triggerEntityIds) {
    if (!entityIds.has(entityId)) errors.push(`Unknown trigger entity: ${entityId}`);
  }

  const targetEntityIds = Array.isArray(actions[0]?.target?.entity_id)
    ? actions[0].target.entity_id
    : [actions[0]?.target?.entity_id].filter(Boolean);
  for (const entityId of targetEntityIds) {
    if (!entityIds.has(entityId)) errors.push(`Unknown action entity: ${entityId}`);
  }

  if (actions[0]?.action !== 'light.turn_on' && actions[0]?.service !== 'light.turn_on') {
    errors.push('MVP only supports light.turn_on actions.');
  }

  return {
    schema_valid: Boolean(automation && typeof automation === 'object'),
    grounded: errors.every((error) => !error.startsWith('Unknown')),
    blockly_supported: errors.length === 0,
    errors,
  };
}

export function createFakeAutomationDraft(payload = {}) {
  const command = text(payload.command);
  const cards = Array.isArray(payload.entity_cards) ? payload.entity_cards : [];
  const selections = payload.selections && typeof payload.selections === 'object'
    ? payload.selections
    : {};

  if (!command) {
    return { status: 'failure', error: 'command is required' };
  }
  if (!cards.length) {
    return { status: 'failure', error: 'No Home Assistant entities are available.' };
  }
  if (!MOTION_RE.test(command) || !TURN_ON_RE.test(command)) {
    return {
      status: 'unsupported',
      reason: '현재 프로토타입은 움직임 감지 → 조명 켜기 자동화만 지원합니다.',
    };
  }

  const triggerCandidates = rankedCandidates(
    command,
    cards,
    (card) => card.domain === 'binary_sensor',
    'trigger',
  );
  const actionCandidates = rankedCandidates(
    command,
    cards,
    (card) => card.domain === 'light',
    'action',
  );

  const trigger = resolveCandidate(command, triggerCandidates, selections.trigger_entity_id);
  if (trigger === undefined) return confirmation('trigger', triggerCandidates);
  if (trigger === null) {
    return { status: 'unsupported', reason: '요청에 맞는 움직임 센서를 찾지 못했습니다.' };
  }

  const actionTarget = resolveCandidate(command, actionCandidates, selections.action_entity_id);
  if (actionTarget === undefined) return confirmation('action', actionCandidates);
  if (actionTarget === null) {
    return { status: 'unsupported', reason: '요청에 맞는 조명을 찾지 못했습니다.' };
  }

  const automation = {
    alias: `${trigger.friendly_name || trigger.entity_id} 감지 시 ${actionTarget.friendly_name || actionTarget.entity_id} 켜기`,
    triggers: [{
      platform: 'state',
      entity_id: [trigger.entity_id],
      from: 'off',
      to: 'on',
    }],
    conditions: [],
    actions: [{
      action: 'light.turn_on',
      service: 'light.turn_on',
      target: { entity_id: [actionTarget.entity_id] },
      data: {},
    }],
  };
  const validation = validateDraft(automation, cards);

  if (validation.errors.length) {
    return { status: 'failure', error: 'Generated draft failed validation.', validation };
  }

  return {
    status: 'success',
    provider: 'fake',
    automation,
    validation,
    selected_entities: {
      trigger: trigger.entity_id,
      action: actionTarget.entity_id,
    },
  };
}
