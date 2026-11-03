import * as Blockly from 'blockly';

// Keep ordinary dropdowns untouched; only entity selectors receive type-ahead.
const ENTITY_FIELD_NAMES = new Set(['ENTITY', 'ENTITY_ID', 'AFTER_ENTITY', 'BEFORE_ENTITY', 'TARGET']);
const SEARCH_ENABLED = Symbol('haEntitySearchEnabled');

function optionsFor(field) {
  return (field.getOptions?.(false) || []).map(([label, value]) => [
    typeof label === 'string' && label.trim() ? label : String(value || ''),
    String(value ?? ''),
  ]);
}

function openSearch(field) {
  const content = Blockly.DropDownDiv.getContentDiv();
  content.replaceChildren();
  const root = document.createElement('div');
  root.className = 'ha-entity-search-dropdown';
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'ha-entity-search-input';
  input.placeholder = 'Search entities…';
  input.autocomplete = 'off';
  const results = document.createElement('div');
  results.className = 'ha-entity-search-results';
  root.append(input, results);
  content.appendChild(root);

  const options = optionsFor(field);
  let matches = options;
  let active = -1;
  const choose = (value) => {
    field.setValue(value);
    Blockly.DropDownDiv.hideIfOwner(field, true);
  };
  const render = () => {
    results.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'ha-entity-search-empty';
      empty.textContent = 'No matching entities';
      results.appendChild(empty);
      return;
    }
    matches.forEach(([label, value], index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'ha-entity-search-option';
      option.classList.toggle('is-active', index === active);
      option.classList.toggle('is-selected', value === field.getValue());
      option.textContent = label;
      option.addEventListener('pointerdown', (event) => event.preventDefault());
      option.addEventListener('click', () => choose(value));
      results.appendChild(option);
    });
  };
  const filter = () => {
    const query = input.value.trim().toLowerCase();
    matches = !query ? options : options.filter(([label, value]) =>
      `${label} ${value}`.toLowerCase().includes(query));
    active = -1;
    render();
  };
  input.addEventListener('input', filter);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      Blockly.DropDownDiv.hideIfOwner(field, true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!matches.length) return;
      event.preventDefault();
      active = event.key === 'ArrowDown'
        ? (active + 1 + matches.length) % matches.length
        : (active - 1 + matches.length) % matches.length;
      render();
      results.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && active >= 0 && matches[active]) {
      event.preventDefault();
      choose(matches[active][1]);
    }
  });
  render();
  Blockly.DropDownDiv.setColour('#ffffff', '#b8c0cc');
  Blockly.DropDownDiv.showPositionedByField(field, () => content.replaceChildren());
  requestAnimationFrame(() => input.focus());
}

export function enableEntitySearch(field) {
  if (!(field instanceof Blockly.FieldDropdown) || field[SEARCH_ENABLED]) return;
  field[SEARCH_ENABLED] = true;
  field.showEditor_ = function showEntitySearchEditor() { openSearch(this); };
}

export function installEntityDropdownSearch(workspace) {
  const enhance = (block) => {
    if (!block?.getField) return;
    ENTITY_FIELD_NAMES.forEach((name) => enableEntitySearch(block.getField(name)));
  };
  const refresh = () => workspace.getAllBlocks(false).forEach(enhance);
  refresh();
  workspace.addChangeListener((event) => {
    if (event.type === Blockly.Events.BLOCK_CREATE || event.type === Blockly.Events.FINISHED_LOADING) {
      queueMicrotask(refresh);
    } else if (event.type === Blockly.Events.BLOCK_CHANGE) {
      queueMicrotask(() => enhance(workspace.getBlockById(event.blockId)));
    }
  });
  return refresh;
}
