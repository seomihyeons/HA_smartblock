import yaml from 'js-yaml';
import { normalizeToAutomationIr } from '../src/automation_ir/schema.mjs';

const text = (value) => String(value ?? '').trim();

function entityIds(value) {
  const ids = new Set();
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if (key === 'entity_id') {
        for (const item of Array.isArray(child) ? child : [child]) {
          for (const id of text(item).split(',')) {
            if (/^[a-z_]+\.[a-z0-9_]+$/i.test(id.trim())) ids.add(id.trim());
          }
        }
      }
      visit(child);
    }
  };
  visit(value);
  return ids;
}

function loadAutomation(baseYaml) {
  const parsed = yaml.load(text(baseYaml), { schema: yaml.JSON_SCHEMA });
  return normalizeToAutomationIr(parsed).automation;
}

function permitsRemoval(command) {
  return /\b(remove|delete|replace|discard|clear)\b|삭제|제거|교체|대체/u.test(String(command || ''));
}

/**
 * A conservative, command-agnostic guard for modifications. It prevents a
 * model from silently dropping existing devices, branches, or root settings.
 * Explicit removal/replacement requests remain possible.
 */
export function validateModificationPreservation({ baseYaml, automation, command }) {
  const errors = [];
  let base;
  try {
    base = loadAutomation(baseYaml);
  } catch {
    return { valid: true, errors: [] };
  }
  if (!base || !automation || typeof automation !== 'object') return { valid: true, errors: [] };
  const allowsRemoval = permitsRemoval(command);
  if (!allowsRemoval) {
    const retained = entityIds(automation);
    for (const id of entityIds(base)) {
      if (!retained.has(id)) errors.push(`Modification omitted an existing entity without an explicit removal request: ${id}`);
    }
    for (const key of ['triggers', 'conditions', 'actions']) {
      const before = Array.isArray(base[key]) ? base[key].length : 0;
      const after = Array.isArray(automation[key]) ? automation[key].length : 0;
      if (after < before) errors.push(`Modification removed existing ${key} without an explicit removal request.`);
    }
  }
  if (base.id != null && automation.id !== base.id) {
    errors.push('Modification changed the existing automation ID.');
  }
  // Keep non-ECA root settings such as mode, variables, and metadata unless a
  // future explicit setting-edit contract states otherwise.
  for (const [key, value] of Object.entries(base)) {
    if (['alias', 'id', 'triggers', 'conditions', 'actions'].includes(key)) continue;
    if (JSON.stringify(automation[key]) !== JSON.stringify(value)) {
      errors.push(`Modification changed the existing ${key} setting.`);
    }
  }
  return { valid: errors.length === 0, errors };
}
