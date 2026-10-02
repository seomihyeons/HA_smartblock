import * as Blockly from 'blockly';
import { toolbox } from './toolbox.js';
import { DOMAIN_SPEC } from './data/options.js';
import { setModalOpenState } from './utils/floating_modal_state.js';

const SEARCHABLE_CATEGORIES = new Set(['Rule', 'Event', 'Condition', 'Action']);

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function readableType(type) {
  return String(type || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function tokenize(value) {
  return normalize(value).match(/[a-z0-9]+/g) || [];
}

// Familiar Home Assistant terms improve block discovery without creating
// duplicate block definitions. For example, `door` should find the binary
// sensor state blocks used for doors, contacts, windows, and motion sensors.
const BLOCK_SEARCH_ALIASES = {
  event_binary_sensor_state: 'sensor contact door window motion occupancy',
  condition_state_binary_sensor: 'sensor contact door window motion occupancy',
  action_lock: 'door lock unlock',
  action_cover: 'door garage shutter blind open close',
  condition_logic: 'and or logical',
};

function actionSearchTerms(type) {
  const domain = String(type || '').replace(/^action_/, '');
  const actions = DOMAIN_SPEC[domain]?.actions || [];
  return actions.flatMap(([label, value]) => [label, value.replace(/_/g, ' ')]).join(' ');
}

function matchesSearch(query, searchable) {
  if (!query) return true;
  const searchableTokens = new Set(tokenize(searchable));
  return tokenize(query).every((token) => searchableTokens.has(token));
}

function cloneFlyoutItem(item) {
  // Flyout normalisation may add defaults to a block-info object. Keep the
  // search flyout independent from the Toolbox's source definitions.
  return JSON.parse(JSON.stringify(item));
}

export function getBlockSearchResults(query) {
  const searchText = normalize(query);
  const result = [];

  toolbox.contents
    .filter((category) => category.kind === 'category' && SEARCHABLE_CATEGORIES.has(category.name))
    .forEach((category) => {
      let section = '';
      const matches = [];

      (category.contents || []).forEach((item) => {
        if (item.kind === 'label') {
          section = String(item.text || '');
          return;
        }
        if (item.kind !== 'block' || !item.type) return;

        const searchable = normalize([
          item.type,
          readableType(item.type),
          category.name,
          section,
          BLOCK_SEARCH_ALIASES[item.type],
          item.type.startsWith('action_') ? actionSearchTerms(item.type) : '',
        ].join(' '));
        if (matchesSearch(searchText, searchable)) {
          matches.push({ type: item.type, category: category.name, section, item });
        }
      });

      if (!matches.length) return;
      result.push(...matches);
    });

  return result;
}

export function getSearchDefinition(query) {
  const result = [
    // Reserve vertical room for the HTML input that sits above this SVG flyout.
    { kind: 'label', text: ' ' },
    { kind: 'sep', gap: 44 },
  ];
  const matches = getBlockSearchResults(query);
  let lastCategory = null;
  let lastSection = null;

  matches.forEach(({ item, category, section }) => {
    if (category !== lastCategory) {
      lastCategory = category;
      lastSection = null;
    }
    if (section && section !== lastSection) {
      result.push({ kind: 'label', text: section });
      lastSection = section;
    }
    result.push(cloneFlyoutItem(item));
  });

  if (!matches.length) {
    result.push({ kind: 'label', text: 'No matching blocks' });
  }
  return result;
}

class StableWidthSearchFlyout extends Blockly.VerticalFlyout {
  fixedWidth_ = 0;

  lockCurrentWidth() {
    this.fixedWidth_ = this.getWidth();
    this.position();
  }

  reflowInternal_() {
    super.reflowInternal_();
    if (!this.fixedWidth_ || this.width_ >= this.fixedWidth_) return;

    // Keep the right edge anchored while retaining the width calculated from
    // the complete initial result set. Filtering must not resize the drawer.
    this.width_ = this.fixedWidth_;
    this.position();
    this.targetWorkspace.recordDragTargets();
  }
}

export function initBlockSearchFlyout({ workspace } = {}) {
  const button = document.getElementById('btnBlockSearch');
  const header = document.getElementById('blockSearchFlyoutHeader');
  const input = document.getElementById('blockSearchFlyoutInput');
  const closeButton = document.getElementById('blockSearchFlyoutClose');
  if (!workspace || !button || !header || !input || !closeButton) return;

  const flyoutOptions = Object.create(workspace.options);
  flyoutOptions.toolboxPosition = Blockly.utils.toolbox.Position.RIGHT;
  const searchFlyout = new StableWidthSearchFlyout(flyoutOptions);
  workspace.getParentSvg().append(searchFlyout.createDom('g'));
  searchFlyout.init(workspace);
  searchFlyout.setAutoClose(false);

  const render = () => searchFlyout.show(getSearchDefinition(input.value));

  const open = () => {
    button.classList.add('hidden');
    header.classList.remove('hidden');
    setModalOpenState('blockSearchFlyout', true);
    input.value = '';
    render();
    searchFlyout.lockCurrentWidth();
    requestAnimationFrame(() => input.focus());
  };

  const close = () => {
    searchFlyout.hide();
    header.classList.add('hidden');
    setModalOpenState('blockSearchFlyout', false);
    button.classList.remove('hidden');
    button.focus();
  };

  button.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  input.addEventListener('input', render);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !header.classList.contains('hidden')) close();
  });
}
