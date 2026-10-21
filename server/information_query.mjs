import { selectEntityCards } from './target_selector.mjs';

const text = (value) => String(value ?? '').trim();
const COLLECTION_PROJECTIONS = new Set([
  'display_name', 'entity_id', 'domain', 'area', 'state', 'capability_attributes',
  'device_class',
]);

function publicEntity(card, projection) {
  const output = {};
  for (const field of projection) {
    if (field === 'display_name') output.display_name = card.friendly_name || card.entity_id;
    else if (field === 'entity_id') output.entity_id = card.entity_id;
    else if (field === 'domain') output.domain = card.domain;
    else if (field === 'area') output.area = card.area || null;
    else if (field === 'state') output.state = card.state ?? null;
    else if (field === 'device_class') output.device_class = card.device_class || null;
    else if (field === 'capability_attributes') output.capability_attributes = card.capability_attributes || {};
  }
  return output;
}

/** Execute read-only information plans against fresh live EntityCards. */
export function executeInformationQuery(entityCards, plan = {}) {
  const operation = text(plan.operation);
  if (operation === 'entity_collection' && (!Array.isArray(plan.projection) || !plan.projection.some((field) => COLLECTION_PROJECTIONS.has(field)))) return { status: 'invalid_request', reason: 'missing_supported_projection' };
  if (operation === 'entity_collection' && plan.aggregation && plan.aggregation !== 'count') return { status: 'unsupported_capability', aggregation: plan.aggregation };
  const selection = selectEntityCards(entityCards, plan.target);
  if (selection.status === 'invalid') {
    return { status: 'invalid_request', reason: selection.reason };
  }
  if (selection.status === 'empty' && operation === 'entity_collection') {
    return plan.aggregation === 'count'
      ? { status: 'success', kind: 'collection', aggregate: { kind: 'count', count: 0 } }
      : { status: 'success', kind: 'collection', entities: [], total_count: 0 };
  }
  if (selection.status === 'empty') {
    return { status: 'entity_not_found', entities: [] };
  }

  if (operation === 'entity_property') {
    if (selection.cards.length !== 1) {
      return {
        status: 'ambiguous',
        entities: selection.cards.slice(0, 8).map((card) => publicEntity(card, ['display_name', 'entity_id', 'area', 'state'])),
      };
    }
    const property = text(plan.property);
    const card = selection.cards[0];
    if (property === 'state') {
      return { status: 'success', kind: 'property', property, entity: publicEntity(card, ['display_name', 'entity_id', 'domain', 'area', 'device_class', 'state']) };
    }
    const attributes = card.capability_attributes && typeof card.capability_attributes === 'object'
      ? card.capability_attributes : {};
    if (!property || !(property in attributes)) {
      return { status: 'unsupported_capability', property, entity: publicEntity(card, ['display_name', 'entity_id']) };
    }
    return {
      status: 'success', kind: 'property', property,
      entity: { ...publicEntity(card, ['display_name', 'entity_id', 'domain', 'area']), value: attributes[property], unit: property === 'state' ? attributes.unit_of_measurement : null },
    };
  }

  if (operation !== 'entity_collection') {
    return { status: 'invalid_request', reason: 'unsupported_information_operation' };
  }
  const requestedProjection = Array.isArray(plan.projection) ? plan.projection.map(text) : [];
  const projection = requestedProjection.filter((field) => COLLECTION_PROJECTIONS.has(field));
  if (!projection.length) return { status: 'invalid_request', reason: 'missing_supported_projection' };
  const aggregation = text(plan.aggregation);
  if (aggregation && aggregation !== 'count') {
    return { status: 'unsupported_capability', aggregation };
  }
  if (aggregation === 'count') {
    const filter = plan.target?.filter && typeof plan.target.filter === 'object' ? plan.target.filter : {};
    return {
      status: 'success', kind: 'collection',
      aggregate: { kind: 'count', count: selection.cards.length, domain: text(filter.domain) || null },
    };
  }
  return {
    status: 'success',
    kind: 'collection',
    entities: selection.cards.slice(0, 50).map((card) => publicEntity(card, projection)),
    total_count: selection.cards.length,
  };
}
