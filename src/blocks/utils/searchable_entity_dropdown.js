import * as Blockly from 'blockly';

// These fields represent entities in the current block.  Other dropdowns
// (state, service, mode, etc.) deliberately retain Blockly's normal menu.
const ENTITY_FIELD_NAMES = new Set(['ENTITY', 'ENTITY_ID', 'AFTER_ENTITY', 'BEFORE_ENTITY']);
const SEARCH_ENABLED = Symbol('haEntitySearchEnabled');

function optionText(option) {
  const [label, value] = option;
  return typeof label === 'string' && label.trim() ? label : String(value || '');
}

function getEntityOptions(field) {
  // false deliberately bypasses FieldDropdown's dynamic-option cache so a
  // freshly loaded Home Assistant entity list is reflected when the menu opens.
  return (field.getOptions?.(false) || [])
    .map(([label, value]) => [optionText([label, value]), String(value ?? '')]);
}

function getEntityFieldCategory(field) {
  const type = String(field.getSourceBlock()?.type || '');
  if (type.startsWith('event_')) return 'trigger';
  if (type.startsWith('condition_')) return 'condition';
  if (type.startsWith('action_')) return 'action';
  return 'action';
}

function openEntitySearch(field) {
  const content = Blockly.DropDownDiv.getContentDiv();
  content.replaceChildren();

  const root = document.createElement('div');
  root.className = `ha-entity-search-dropdown ha-entity-search--${getEntityFieldCategory(field)}`;

  const input = document.createElement('input');
  input.className = 'ha-entity-search-input';
  input.type = 'search';
  input.placeholder = 'Search entities…';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Search entities');

  const results = document.createElement('div');
  results.className = 'ha-entity-search-results';
  results.setAttribute('role', 'listbox');
  results.setAttribute('aria-label', 'Entity results');

  root.append(input, results);
  content.appendChild(root);

  const options = getEntityOptions(field);
  let matchingOptions = options;
  let activeIndex = -1;

  const choose = (value) => {
    // Use Blockly's normal setter so existing validators continue to update
    // dependent fields (for example, Numeric State units and state choices).
    field.setValue(value);
    Blockly.DropDownDiv.hideIfOwner(field, true);
  };

  const renderResults = () => {
    results.replaceChildren();
    if (!matchingOptions.length) {
      const empty = document.createElement('div');
      empty.className = 'ha-entity-search-empty';
      empty.textContent = 'No matching entities';
      results.appendChild(empty);
      activeIndex = -1;
      return;
    }

    if (activeIndex >= matchingOptions.length) activeIndex = -1;
    matchingOptions.forEach(([label, value], index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'ha-entity-search-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', value === field.getValue() ? 'true' : 'false');
      option.classList.toggle('is-active', index === activeIndex);
      option.classList.toggle('is-selected', value === field.getValue());

      const name = document.createElement('span');
      name.className = 'ha-entity-search-name';
      name.textContent = label;
      option.appendChild(name);

      option.addEventListener('pointerdown', (event) => event.preventDefault());
      option.addEventListener('click', () => choose(value));
      results.appendChild(option);
    });
  };

  const filter = () => {
    const query = input.value.trim().toLocaleLowerCase();
    matchingOptions = !query
      ? options
      : options.filter(([label, value]) => `${label} ${value}`.toLocaleLowerCase().includes(query));
    activeIndex = -1;
    renderResults();
  };

  input.addEventListener('input', filter);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      Blockly.DropDownDiv.hideIfOwner(field, true);
      return;
    }
    if (!matchingOptions.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      activeIndex = activeIndex < 0
        ? (direction > 0 ? 0 : matchingOptions.length - 1)
        : (activeIndex + direction + matchingOptions.length) % matchingOptions.length;
      renderResults();
      results.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = matchingOptions[activeIndex];
      if (selected) choose(selected[1]);
    }
  });

  renderResults();
  Blockly.DropDownDiv.setColour('#ffffff', '#b8c0cc');
  Blockly.DropDownDiv.showPositionedByField(field, () => content.replaceChildren());
  // The DropdownDiv must be visible before the input can reliably receive focus.
  requestAnimationFrame(() => input.focus());
}

export function enableEntitySearch(field) {
  if (!(field instanceof Blockly.FieldDropdown) || field[SEARCH_ENABLED]) return;
  field[SEARCH_ENABLED] = true;
  field.showEditor_ = function showEntitySearchEditor() {
    openEntitySearch(this);
  };
}

function enhanceBlockEntityFields(block) {
  if (!block?.getField) return;
  for (const fieldName of ENTITY_FIELD_NAMES) {
    enableEntitySearch(block.getField(fieldName));
  }
}

/**
 * Adds entity-only search behavior to blocks in one workspace without changing
 * their saved values, menu generators, or validators.
 */
export function installEntityDropdownSearch(workspace) {
  const enhanceAll = () => workspace.getAllBlocks(false).forEach(enhanceBlockEntityFields);
  const pendingBlockIds = new Set();
  let blockRefreshQueued = false;

  const refreshChangedBlocks = () => {
    blockRefreshQueued = false;
    for (const blockId of pendingBlockIds) {
      enhanceBlockEntityFields(workspace.getBlockById(blockId));
    }
    pendingBlockIds.clear();
  };

  const scheduleChangedBlockRefresh = (blockId) => {
    if (!blockId) return;
    pendingBlockIds.add(blockId);
    if (blockRefreshQueued) return;
    blockRefreshQueued = true;
    queueMicrotask(refreshChangedBlocks);
  };

  enhanceAll();

  workspace.addChangeListener((event) => {
    if (event.type === Blockly.Events.BLOCK_CREATE || event.type === Blockly.Events.FINISHED_LOADING) {
      queueMicrotask(enhanceAll);
      return;
    }
    if (event.type === Blockly.Events.BLOCK_CHANGE) {
      // Dynamic blocks such as time conditions can remove and recreate an
      // entity dropdown after their mode changes. Re-attach search only to the
      // affected block, after that shape update completes.
      scheduleChangedBlockRefresh(event.blockId);
    }
  });

  return enhanceAll;
}
