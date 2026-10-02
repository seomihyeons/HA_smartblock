import * as Blockly from 'blockly';
import { toolbox } from './toolbox.js';
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
        if (!searchText || searchable.includes(searchText)) {
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
