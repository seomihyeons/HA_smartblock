import * as Blockly from 'blockly';
import { toolbox } from './toolbox.js';
import { DOMAIN_SPEC } from './data/options.js';
import { dummyEntities } from './data/entities_index.js';
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
  event_binary_sensor_state: 'sensor contact door window motion occupancy open opened closed',
  condition_state_binary_sensor: 'sensor contact door window motion occupancy open opened closed',
  action_lock: 'door lock unlock',
  action_cover: 'door garage shutter blind open close',
  condition_logic: 'and or logical',
  condition_zone_membership: 'zone home away presence location in not',
};

function actionSearchTerms(type) {
  const domain = String(type || '').replace(/^action_/, '');
  const actions = DOMAIN_SPEC[domain]?.actions || [];
  return actions.flatMap(([label, value]) => [label, value.replace(/_/g, ' ')]).join(' ');
}

function blockDomain(type) {
  for (const domain of Object.keys(DOMAIN_SPEC)) {
    if (
      type === `event_${domain}_state` ||
      type === `condition_state_${domain}` ||
      type === `action_${domain}`
    ) {
      return domain;
    }
  }
  return '';
}

function runtimeEntitySearchTerms(type) {
  const domain = blockDomain(type);
  if (!domain) return '';

  return (dummyEntities || [])
    .filter((entity) => String(entity?.entity_id || '').startsWith(`${domain}.`))
    .flatMap((entity) => [
      entity.entity_id,
      entity.name,
      entity.friendly_name,
      entity.attributes?.friendly_name,
    ])
    .filter(Boolean)
    .join(' ');
}

function searchScore(query, searchable) {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return 0;

  const text = normalize(searchable);
  const searchableTokens = [...new Set(tokenize(text))];
  let score = text.includes(normalize(query)) ? 200 : 0;

  for (const queryToken of queryTokens) {
    let tokenScore = 0;
    for (const searchableToken of searchableTokens) {
      if (searchableToken === queryToken) tokenScore = Math.max(tokenScore, 100);
      else if (searchableToken.startsWith(queryToken)) tokenScore = Math.max(tokenScore, 75);
      else if (searchableToken.includes(queryToken)) tokenScore = Math.max(tokenScore, 50);
    }

    // Every typed term must occur somewhere, but it may be an infix match:
    // `eve` finds Event and `d` finds door-related blocks.
    if (!tokenScore) return -1;
    score += tokenScore;
  }
  return score;
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

        const searchable = [
          item.type,
          readableType(item.type),
          category.name,
          section,
          BLOCK_SEARCH_ALIASES[item.type],
          item.type.startsWith('action_') ? actionSearchTerms(item.type) : '',
          runtimeEntitySearchTerms(item.type),
        ].join(' ');
        const score = searchText ? searchScore(searchText, searchable) : 0;
        if (!searchText || score >= 0) {
          matches.push({ type: item.type, category: category.name, section, item, score });
        }
      });

      if (!matches.length) return;
      // Preserve category order, but make exact/prefix/entity matches appear
      // before broad infix matches within each category.
      matches.sort((a, b) => b.score - a.score || a.type.localeCompare(b.type));
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

// The native category toolbox owns a separate flyout from Block Search.  Keep
// its closing behavior in one place so the two surfaces cannot overlap.
export function closeNativeToolboxFlyout(workspace) {
  const toolbox = workspace?.getToolbox?.();
  if (!toolbox) return;

  toolbox.clearSelection?.();
  toolbox.getFlyout?.()?.hide?.();
}

export function isToolboxCategorySelection(event) {
  return event?.type === Blockly.Events.TOOLBOX_ITEM_SELECT && event.newItem != null;
}

// The closed launcher belongs in Blockly's SVG, not in the page's fixed HTML
// layer.  Inserting it immediately before Blockly's native Toolbox flyout
// gives the native flyout the next SVG paint layer: a Toolbox category then
// renders over the launcher instead of being covered by it.
function createSvgSearchLauncher(workspace) {
  // The category flyout is owned by the Toolbox. `WorkspaceSvg#getFlyout`
  // can instead refer to a workspace-owned flyout, which is absent for this
  // configuration and previously made the launcher silently disappear.
  const nativeFlyout = workspace.getToolbox?.()?.getFlyout?.();
  const nativeFlyoutGroup = nativeFlyout?.svgGroup_;
  if (!nativeFlyoutGroup?.parentNode) {
    console.error('Block Search launcher could not locate the native Toolbox flyout.');
    return null;
  }

  const svg = Blockly.utils.dom.createSvgElement;
  // Blockly places each flyout in its own <svg>, as a direct child of the
  // injection div. Therefore the launcher must also be an SVG root: an SVG
  // <g> at this level is invalid HTML and is not painted by the browser.
  const group = svg('svg', {
    class: 'block-search-launcher',
    role: 'button',
    tabindex: '0',
    'aria-label': 'Search blocks',
    width: 430,
    height: 34,
  }, null);
  svg('rect', {
    class: 'block-search-launcher-background',
    width: 430,
    height: 34,
    rx: 6,
  }, group);
  const icon = svg('text', {
    class: 'block-search-launcher-icon',
    x: 12,
    y: 22,
  }, group);
  icon.textContent = '⌕';
  const label = svg('text', {
    class: 'block-search-launcher-label',
    x: 34,
    y: 22,
  }, group);
  label.textContent = 'Search blocks';

  // Blockly draws SVG siblings in document order. This must stay directly
  // before the native flyout group so category flyouts paint above it.
  nativeFlyoutGroup.parentNode.insertBefore(group, nativeFlyoutGroup);

  return {
    group,
    show() {
      group.style.display = '';
    },
    hide() {
      group.style.display = 'none';
    },
  };
}

export function initBlockSearchFlyout({ workspace } = {}) {
  const header = document.getElementById('blockSearchFlyoutHeader');
  const input = document.getElementById('blockSearchFlyoutInput');
  const closeButton = document.getElementById('blockSearchFlyoutClose');
  if (!workspace || !header || !input || !closeButton) return;

  const flyoutOptions = Object.create(workspace.options);
  flyoutOptions.toolboxPosition = Blockly.utils.toolbox.Position.RIGHT;
  const searchFlyout = new StableWidthSearchFlyout(flyoutOptions);
  workspace.getParentSvg().append(searchFlyout.createDom('g'));
  searchFlyout.init(workspace);
  searchFlyout.setAutoClose(false);
  const launcher = createSvgSearchLauncher(workspace);
  if (!launcher) return;

  const render = () => searchFlyout.show(getSearchDefinition(input.value));
  let isSearchOpen = false;

  // Search is one surface: its HTML header and custom Blockly flyout must
  // always be opened and closed together.
  const setSearchOpen = (nextOpen, { returnFocus = true } = {}) => {
    if (nextOpen) {
      // Clear the native category selection before showing Search. A category
      // flyout and the custom Search flyout must never occupy the workspace
      // together.
      closeNativeToolboxFlyout(workspace);
      launcher.hide();
      header.classList.remove('hidden');
      setModalOpenState('blockSearchFlyout', true);
      input.value = '';
      render();
      searchFlyout.lockCurrentWidth();
      isSearchOpen = true;
      requestAnimationFrame(() => input.focus());
      return;
    }

    // Do not leave the fixed HTML search bar visible after its SVG flyout has
    // been hidden by a Toolbox selection or another external interaction.
    searchFlyout.hide();
    header.classList.add('hidden');
    input.value = '';
    setModalOpenState('blockSearchFlyout', false);
    isSearchOpen = false;
    launcher.show();
    if (returnFocus) launcher.group.focus();
  };

  const open = () => setSearchOpen(true);
  const close = (options) => setSearchOpen(false, options);

  const isInsideSearch = (target) =>
    target instanceof Node && (
      header.contains(target) ||
      searchFlyout.svgGroup_?.contains?.(target)
    );

  const closeWhenClickingElsewhere = (event) => {
    if (!isSearchOpen || isInsideSearch(event.target)) return;

    // The search header and its Blockly flyout are one interaction surface.
    // A click anywhere else (workspace, toolbox, a block, or another page
    // control) has the same result as pressing the header's × button.
    close({ returnFocus: false });
  };

  launcher.group.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    open();
  });
  launcher.group.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    open();
  });
  closeButton.addEventListener('click', close);
  input.addEventListener('input', render);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  // Blockly may stop bubbling pointer events from its SVG workspace. Listen
  // during capture so workspace and toolbox clicks are observed reliably.
  document.addEventListener('pointerdown', closeWhenClickingElsewhere, true);
  workspace.addChangeListener((event) => {
    // Use Blockly's category-selection event rather than DOM click detection
    // so keyboard and pointer category selection behave identically.
    if (event?.type !== Blockly.Events.TOOLBOX_ITEM_SELECT) return;

    if (isSearchOpen && isToolboxCategorySelection(event)) {
      // Preserve focus on the newly selected Toolbox category instead of
      // returning it to the hidden Search button.
      close({ returnFocus: false });
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isSearchOpen) close();
  });
}
