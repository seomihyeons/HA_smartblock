/**
 * Deterministic Context Sufficiency Check (Phase 03).
 * This pure preflight does NOT infer intent, call LLMs, access Home Assistant,
 * execute proposed tools, or authorize any service/automation writes.
 *
 * Trust boundary: requirements.source=host_verified and complete=true must
 * only be set by trusted host-side intent verification, NEVER from model or
 * client input without independent verification.
 */
const str = { type: 'string', minLength: 1 };
const eid = { type: 'string', pattern: '^[a-zA-Z0-9_]+[.][a-zA-Z0-9_]+$' };
const arr = (items) => ({ type: 'array', items, maxItems: 1000 });
const rec = (properties, required = []) => ({
  type: 'object', properties, required, additionalProperties: false,
});
export const CONTEXT_SUFFICIENCY_INPUT_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object', additionalProperties: false, required: ['requirements','context'],
  properties: {
    request: rec({ command: str, operation: str }),
    requirements: rec({
      source: { enum: ['host_verified','provisional'] },
      complete: { type: 'boolean' },
      entities: arr(eid),
      collections: arr(rec({ domain: str, area: str, require_all: { type: 'boolean' } })),
      attributes: arr(rec({ entity_id: eid, name: str }, ['entity_id','name'])),
      services: arr(rec({ entity_id: eid, service: str }, ['entity_id','service'])),
      automation_details: arr(rec({ automation_id: str }, ['automation_id'])),
      history: arr(rec({ entity_id: eid, start: str, end: str }, ['entity_id','start','end'])),
      traces: arr(rec({ automation_id: str, run_id: str }, ['automation_id'])),
      preferences: arr(rec({ person_id: eid, key: str }, ['person_id','key'])),
      household_occupancy: { type: 'boolean' },
    }, ['source','complete']),
    context: rec({
      entity_cards: arr({ type: 'object', required: ['entity_id'], additionalProperties: true }),
      retrieved_entity_ids: arr(eid),
      entity_resolution: arr({ type: 'object', additionalProperties: true }),
      automation_catalog: arr({ type: 'object', additionalProperties: true }),
      provided_automation_ids: arr(str),
      history_evidence: arr({ type: 'object', additionalProperties: true }),
      trace_evidence: arr({ type: 'object', additionalProperties: true }),
      household_roster: { anyOf: [
        rec({ complete: { type: 'boolean' }, person_ids: arr(eid) }, ['complete','person_ids']),
        { type: 'null' },
      ] },
      preference_evidence: arr({ type: 'object', additionalProperties: true }),
    }, ['entity_cards','retrieved_entity_ids']),
  },
});
const issueSchema = rec({
  type: str, code: str, reference: { type: ['string','null'] },
  resolution: { enum: ['expand_context','tool_lookup','clarification','existing_planner'] },
  tool: { type: ['string','null'] },
}, ['type','code','reference','resolution','tool']);
export const CONTEXT_SUFFICIENCY_OUTPUT_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object', additionalProperties: false,
  required: ['schema_version','status','next_action','requirements_verified',
    'missing_context','clarifications','proposed_tool_calls','counts'],
  properties: {
    schema_version: { const: 1 },
    status: { enum: ['sufficient','insufficient','needs_clarification'] },
    next_action: { enum: ['one_call','expand_context','tool_lookup','existing_planner','clarify'] },
    requirements_verified: { type: 'boolean' },
    missing_context: arr(issueSchema),
    clarifications: arr(issueSchema),
    proposed_tool_calls: arr(rec({ tool: str, arguments: { type: 'object' } }, ['tool','arguments'])),
    counts: rec({
      full_entities: { type: 'integer', minimum: 0 },
      retrieved_entities: { type: 'integer', minimum: 0 },
      issues: { type: 'integer', minimum: 0 },
    }, ['full_entities','retrieved_entities','issues']),
  },
});

const READ_TOOLS = new Set([
  'get_entity_details','get_automation_details','get_state_history','get_automation_trace',
]);
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const t = x => typeof x === 'string' ? x.trim() : '';
const norm = x => t(x).normalize('NFKC').toLowerCase();
const list = x => Array.isArray(x) ? x : [];
const own = (x, key) => Object.prototype.hasOwnProperty.call(x || {}, key);
const goodId = id => /^[a-zA-Z0-9_]+[.][a-zA-Z0-9_]+$/.test(t(id));

/** Reject malformed input instead of silently declaring context sufficient. */
function validateInput(input) {
  if (!obj(input) || !obj(input.requirements) || !obj(input.context))
    throw new TypeError('Context check requires requirements and context objects');
  const r = input.requirements, c = input.context;
  if (!['host_verified','provisional'].includes(r.source) || typeof r.complete !== 'boolean')
    throw new TypeError('Requirements must declare source and completeness');
  if (!Array.isArray(c.entity_cards) || !Array.isArray(c.retrieved_entity_ids))
    throw new TypeError('Both full and retrieved EntityCard sets are required');
  for (const key of ['entities','collections','attributes','services','automation_details',
    'history','traces','preferences']) {
    if (r[key] !== undefined && !Array.isArray(r[key]))
      throw new TypeError('Bad requirements.' + key);
  }
  for (const key of ['entity_resolution','automation_catalog','provided_automation_ids',
    'history_evidence','trace_evidence','preference_evidence']) {
    if (c[key] !== undefined && !Array.isArray(c[key]))
      throw new TypeError('Bad context.' + key);
  }
  if (c.entity_cards.some(x => !obj(x) || !goodId(x.entity_id)) ||
      c.retrieved_entity_ids.some(id => !goodId(id)) ||
      list(r.entities).some(id => !goodId(id)))
    throw new TypeError('Malformed Entity ID');
  const checks = {
    collections: x => obj(x) && (t(x.domain) || t(x.area)) &&
      (x.require_all === undefined || typeof x.require_all === 'boolean'),
    attributes: x => obj(x) && goodId(x.entity_id) && !!t(x.name),
    services: x => obj(x) && goodId(x.entity_id) && goodId(x.service),
    automation_details: x => obj(x) && !!t(x.automation_id),
    history: x => obj(x) && goodId(x.entity_id) &&
      Number.isFinite(Date.parse(x.start)) && Number.isFinite(Date.parse(x.end)) &&
      Date.parse(x.start) < Date.parse(x.end),
    traces: x => obj(x) && !!t(x.automation_id),
    preferences: x => obj(x) && goodId(x.person_id) && !!t(x.key),
  };
  for (const [kind, check] of Object.entries(checks)) {
    if (list(r[kind]).some(x => !check(x)))
      throw new TypeError('Invalid ' + kind + ' requirement');
  }
  if (r.household_occupancy !== undefined && typeof r.household_occupancy !== 'boolean')
    throw new TypeError('Bad household_occupancy');
  if (c.household_roster != null && (!obj(c.household_roster) ||
    typeof c.household_roster.complete !== 'boolean' ||
    !Array.isArray(c.household_roster.person_ids) ||
    c.household_roster.person_ids.some(id => !goodId(id))))
    throw new TypeError('Bad household_roster');
}

export function checkContextSufficiency(input) {
  validateInput(input);
  const r = input.requirements, c = input.context;
  const full = new Map(c.entity_cards.map(card => [card.entity_id, card]));
  const visible = new Set(c.retrieved_entity_ids.filter(id => full.has(id)));
  const issues = [], issueKeys = new Set(), toolCalls = new Map();
  function add(type, code, reference, resolution, tool = null, args = null) {
    const entry = { type, code, reference: reference ? String(reference) : null, resolution, tool };
    const key = JSON.stringify(entry);
    if (issueKeys.has(key)) return;
    issueKeys.add(key); issues.push(entry);
    if (resolution === 'tool_lookup' && READ_TOOLS.has(tool) && args) {
      const call = { tool, arguments: args };
      toolCalls.set(JSON.stringify(call), call);
    }
  }
  function entity(id) {
    if (!full.has(id)) {
      add('entity','entity_not_in_live_home',id,'clarification');
      return null;
    }
    if (!visible.has(id)) add('entity','entity_omitted_from_initial_context',id,'expand_context');
    return full.get(id);
  }

  // Respect existing resolver ambiguity, do not silently choose a candidate.
  for (const ref of list(c.entity_resolution)) {
    if (ref?.status === 'ambiguous')
      add('entity_reference','ambiguous_reference',t(ref.reference),'clarification');
    else if (ref?.status === 'resolved' && !full.has(ref.entity_id))
      add('entity_reference','stale_resolved_entity',t(ref.entity_id),'clarification');
  }
  for (const id of list(r.entities)) entity(id);

  // Collection completeness compares bounded retrieved set with full live HA.
  for (const col of list(r.collections)) {
    const domain = norm(col.domain), area = norm(col.area);
    const members = [...full.values()].filter(card =>
      (!domain || norm(card.domain) === domain) && (!area || norm(card.area) === area));
    const scope = domain + (area ? '@' + area : '');
    if (!members.length) add('collection','no_matching_live_entities',scope,'clarification');
    else if (col.require_all !== false) {
      for (const card of members)
        if (!visible.has(card.entity_id))
          add('collection','collection_member_omitted',card.entity_id,'expand_context');
    }
  }
  for (const req of list(r.attributes)) {
    const card = entity(req.entity_id);
    if (!card) continue;
    const key = t(req.name);
    const available = key === 'state'
      ? card.state !== null && card.state !== undefined && card.state !== 'unavailable'
      : obj(card.capability_attributes) && own(card.capability_attributes,key) &&
        card.capability_attributes[key] != null;
    if (!available)
      add('attribute','attribute_not_in_entity_card',req.entity_id + ':' + key,
        'tool_lookup','get_entity_details',{entity_id:req.entity_id,attributes:[key]});
  }
  for (const req of list(r.services)) {
    const card = entity(req.entity_id);
    if (!card) continue;
    const actions = list(card.supported_actions), svc = t(req.service);
    if (!actions.length)
      add('capability','capability_metadata_absent',req.entity_id + ':' + svc,
        'tool_lookup','get_entity_details',{entity_id:req.entity_id});
    else if (!actions.includes(svc))
      add('capability','service_not_supported',req.entity_id + ':' + svc,'clarification');
  }

  const catalog = new Map(list(c.automation_catalog).filter(x => obj(x) && t(x.automation_id))
    .map(x => [x.automation_id,x]));
  const provided = new Set(list(c.provided_automation_ids));
  for (const req of list(r.automation_details)) {
    const id = t(req.automation_id), auto = catalog.get(id);
    if (!auto) add('automation','unknown_automation_reference',id,'clarification');
    else if (!provided.has(id)) {
      if (t(auto.base_yaml)) add('automation','cached_yaml_not_provided',id,'expand_context');
      else add('automation','automation_yaml_not_loaded',id,'tool_lookup',
        'get_automation_details',{automation_id:id});
    }
  }
  for (const req of list(r.history)) {
    if (!entity(req.entity_id)) continue;
    const covered = list(c.history_evidence).some(e => e?.entity_id === req.entity_id &&
      Number.isFinite(Date.parse(e.start)) && Number.isFinite(Date.parse(e.end)) &&
      Date.parse(e.start) <= Date.parse(req.start) && Date.parse(e.end) >= Date.parse(req.end));
    if (!covered) add('history','history_range_missing',req.entity_id,'tool_lookup',
      'get_state_history',{entity_id:req.entity_id,start:req.start,end:req.end});
  }
  for (const req of list(r.traces)) {
    const id = t(req.automation_id), runId = t(req.run_id);
    const covered = list(c.trace_evidence).some(e => e?.automation_id === id &&
      (!runId || e.run_id === runId));
    if (!covered) add('trace','trace_missing',id,'tool_lookup',
      'get_automation_trace',Object.assign({automation_id:id},runId?{run_id:runId}:{}));
  }
  if (r.household_occupancy === true) {
    const roster = c.household_roster;
    if (!roster?.complete || !list(roster.person_ids).length)
      add('household','roster_not_verified_complete',null,'clarification');
    else for (const id of roster.person_ids) entity(id);
  }
  for (const req of list(r.preferences)) {
    if (!list(c.preference_evidence).some(e => e?.person_id === req.person_id &&
      e.key === req.key && e.verified === true))
      add('preference','verified_preference_missing',req.person_id + ':' + req.key,
        'clarification');
  }
  const verified = r.source === 'host_verified' && r.complete === true;
  if (!verified) add('requirements','semantic_coverage_unverified',null,'existing_planner');
  const clarifications = issues.filter(x => x.resolution === 'clarification');
  const missing_context = issues.filter(x => x.resolution !== 'clarification');
  let status, next_action;
  if (clarifications.length) { status = 'needs_clarification'; next_action = 'clarify'; }
  else if (!issues.length) { status = 'sufficient'; next_action = 'one_call'; }
  else {
    status = 'insufficient';
    next_action = !verified ? 'existing_planner'
      : missing_context.some(x => x.resolution === 'expand_context') ? 'expand_context'
      : 'tool_lookup';
  }
  return {
    schema_version:1, status, next_action, requirements_verified:verified,
    missing_context, clarifications, proposed_tool_calls:[...toolCalls.values()],
    counts:{full_entities:full.size,retrieved_entities:visible.size,issues:issues.length},
  };
}
