const text = (value) => String(value ?? '').trim();

function normalized(value) {
  return text(value).normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();
}

function asIds(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(text)
    .filter((id) => /^[a-z0-9_]+\.[a-z0-9_]+$/i.test(id)))];
}

/**
 * Convert a provider plan target into live EntityCards.  This module never
 * infers names from natural language: the model supplies a structural
 * selector, and the server evaluates it against current Home Assistant data.
 */
export function selectEntityCards(entityCards, target = {}) {
  const cards = Array.isArray(entityCards) ? entityCards : [];
  if (!target || typeof target !== 'object') {
    return { status: 'invalid', reason: 'invalid_target', cards: [] };
  }
  const selector = text(target.selector);
  if (selector === 'entity') {
    const entityId = text(target.entity_id);
    if (!entityId) return { status: 'invalid', reason: 'missing_entity_id', cards: [] };
    const card = cards.find((item) => item?.entity_id === entityId);
    return card
      ? { status: 'success', selector, cards: [card] }
      : { status: 'empty', selector, cards: [] };
  }
  if (selector !== 'entity_filter') {
    return { status: 'invalid', reason: 'unsupported_selector', cards: [] };
  }

  const filter = target.filter && typeof target.filter === 'object' ? target.filter : {};
  const entityIds = asIds(filter.entity_ids);
  const domain = text(filter.domain).toLocaleLowerCase();
  const area = normalized(filter.area);
  const state = text(filter.state).toLocaleLowerCase();
  const attributes = filter.attributes && typeof filter.attributes === 'object' ? filter.attributes : {};

  const allowedFilters = new Set(['entity_ids', 'domain', 'area', 'state', 'attributes']);
  if (Object.keys(filter).some((key) => !allowedFilters.has(key)) || (!entityIds.length && !domain && !area && !state && !Object.keys(attributes).length)) {
    return { status: 'invalid', reason: 'empty_or_unsupported_filter', cards: [] };
  }

  const selected = cards.filter((card) => {
    if (!card?.entity_id) return false;
    if (entityIds.length && !entityIds.includes(card.entity_id)) return false;
    if (domain && text(card.domain).toLocaleLowerCase() !== domain) return false;
    if (area && normalized(card.area) !== area) return false;
    if (state && text(card.state).toLocaleLowerCase() !== state) return false;
    const supportedAttributes = card.capability_attributes && typeof card.capability_attributes === 'object'
      ? card.capability_attributes : {};
    return Object.entries(attributes).every(([key, value]) => (
      normalized(supportedAttributes[key]) === normalized(value)
    ));
  });
  return selected.length
    ? { status: 'success', selector, cards: selected }
    : { status: 'empty', selector, cards: [] };
}
