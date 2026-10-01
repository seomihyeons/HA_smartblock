import * as Blockly from 'blockly';
import { toolbox } from './toolbox.js';

const SEARCHABLE_CATEGORIES = new Set(['Rule', 'Event', 'Condition', 'Action']);

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function readableType(type) {
  return String(type || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cloneFlyoutItem(item) {
  // Flyout normalisation may add defaults to a block-info object. Keep the
  // search flyout independent from the Toolbox's source definitions.
  return JSON.parse(JSON.stringify(item));
}

function getSearchDefinition(query) {
  const searchText = normalize(query);
  const result = [
    // Reserve vertical room for the HTML input that sits above this SVG flyout.
    { kind: 'label', text: ' ' },
    { kind: 'sep', gap: 44 },
  ];

  // Search is a secondary aid, not a second always-open toolbox. Keep the
  // drawer compact until the user actually enters a query.
  if (!searchText) {
    result.push({ kind: 'label', text: 'Type to search blocks' });
    return result;
  }

  let matchCount = 0;

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

        const searchable = normalize(`${item.type} ${readableType(item.type)} ${category.name} ${section}`);
        if (searchable.includes(searchText)) {
          matches.push({ item, section });
        }
      });

      if (!matches.length) return;
      let lastSection = null;
      matches.forEach(({ item, section }) => {
        if (section && section !== lastSection) {
          result.push({ kind: 'label', text: section });
          lastSection = section;
        }
        result.push(cloneFlyoutItem(item));
        matchCount += 1;
      });
    });

  if (!matchCount) {
    result.push({ kind: 'label', text: 'No matching blocks' });
  }
  return result;
}

export function initBlockSearchFlyout({ workspace } = {}) {
  const button = document.getElementById('btnBlockSearch');
  const header = document.getElementById('blockSearchFlyoutHeader');
  const input = document.getElementById('blockSearchFlyoutInput');
  const closeButton = document.getElementById('blockSearchFlyoutClose');
  if (!workspace || !button || !header || !input || !closeButton) return;

  const flyoutOptions = Object.create(workspace.options);
  flyoutOptions.toolboxPosition = Blockly.utils.toolbox.Position.RIGHT;
  const searchFlyout = new Blockly.VerticalFlyout(flyoutOptions);
  workspace.getParentSvg().append(searchFlyout.createDom('g'));
  searchFlyout.init(workspace);
  searchFlyout.setAutoClose(false);

  const isOpen = () => !header.classList.contains('hidden');
  const render = () => searchFlyout.show(getSearchDefinition(input.value));

  const close = ({ restoreFocus = true } = {}) => {
    if (!isOpen()) return;
    searchFlyout.hide();
    header.classList.add('hidden');
    button.classList.remove('hidden');
    if (restoreFocus) button.focus();
  };

  const open = () => {
    button.classList.add('hidden');
    header.classList.remove('hidden');
    input.value = '';
    render();
    requestAnimationFrame(() => input.focus());
  };

  button.addEventListener('click', open);
  closeButton.addEventListener('click', () => close());
  input.addEventListener('input', render);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) close();
  });

  // The normal Blockly toolbox has higher interaction priority. Opening or
  // selecting it closes the auxiliary search drawer instead of leaving two
  // competing flyouts on top of the workspace.
  const toolboxDiv = document.querySelector('.blocklyToolboxDiv');
  toolboxDiv?.addEventListener(
    'pointerdown',
    () => close({ restoreFocus: false }),
    true
  );
}
