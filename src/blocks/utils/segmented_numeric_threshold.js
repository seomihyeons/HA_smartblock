import * as Blockly from 'blockly';

export const THRESHOLD_MODES = ['ABOVE', 'BELOW', 'BETWEEN'];
const SEGMENTS = [
  { mode: 'ABOVE', label: 'Above', width: 58 },
  { mode: 'BELOW', label: 'Below', width: 56 },
  { mode: 'BETWEEN', label: 'Between', width: 74 },
];
const HEIGHT = 22;
const PADDING_X = 2;
const WIDTH = SEGMENTS.reduce((total, segment) => total + segment.width, 0) + PADDING_X * 2;

export function getThresholdMode(block) {
  const useAbove = block?.getFieldValue('USE_ABOVE') === 'TRUE';
  const useBelow = block?.getFieldValue('USE_BELOW') === 'TRUE';
  if (useAbove && useBelow) return 'BETWEEN';
  if (useAbove) return 'ABOVE';
  if (useBelow) return 'BELOW';
  return 'NONE';
}

export function setThresholdMode(block, mode) {
  if (!block || !THRESHOLD_MODES.includes(mode)) return;
  const useAbove = mode === 'ABOVE' || mode === 'BETWEEN';
  const useBelow = mode === 'BELOW' || mode === 'BETWEEN';
  if (
    block.getFieldValue('USE_ABOVE') === (useAbove ? 'TRUE' : 'FALSE')
    && block.getFieldValue('USE_BELOW') === (useBelow ? 'TRUE' : 'FALSE')
  ) return;

  const existingGroup = Blockly.Events.getGroup();
  if (!existingGroup) Blockly.Events.setGroup(true);
  block.isUpdatingThresholdMode_ = true;
  try {
    block.setFieldValue(useAbove ? 'TRUE' : 'FALSE', 'USE_ABOVE');
    block.setFieldValue(useBelow ? 'TRUE' : 'FALSE', 'USE_BELOW');
  } finally {
    block.isUpdatingThresholdMode_ = false;
    if (!existingGroup) Blockly.Events.setGroup(false);
  }
  block.updateShape_?.();
}

class VisibleThresholdNumber extends Blockly.FieldNumber {
  isSerializable() {
    return false;
  }
}

export function createVisibleThresholdNumber(role) {
  let field;
  field = new VisibleThresholdNumber(0, null, null, null, (value) => {
    const block = field.getSourceBlock();
    if (!block || block.isSyncingThresholdVisuals_) return value;
    const mode = getThresholdMode(block);
    const target = role === 'PRIMARY'
      ? (mode === 'BELOW' ? 'BELOW' : 'ABOVE')
      : 'BELOW';
    if (mode === 'NONE' || (role === 'SECONDARY' && mode !== 'BETWEEN')) return value;
    block.isEditingThresholdVisual_ = true;
    try {
      block.setFieldValue(value, target);
    } finally {
      block.isEditingThresholdVisual_ = false;
    }
    return value;
  });
  return field;
}

export class SegmentedThresholdModeField extends Blockly.FieldLabel {
  constructor({ containerFill, unselectedText, ariaPrefix }) {
    super('', 'ha-segmented-threshold-text');
    this.containerFill_ = containerFill;
    this.unselectedText_ = unselectedText;
    this.ariaPrefix_ = ariaPrefix;
    this.segmentRects_ = [];
    this.segmentTexts_ = [];
  }

  isClickable() { return true; }
  isClickableInFlyout() { return false; }

  initView() {
    super.initView();
    this.getTextElement()?.setAttribute('display', 'none');
    const root = this.getSvgRoot();
    if (!root || this.segmentRects_.length) return;
    root.setAttribute('role', 'button');
    root.setAttribute('tabindex', '0');
    root.style.cursor = 'pointer';

    const container = Blockly.utils.dom.createSvgElement('rect', {
      x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: HEIGHT / 2, ry: HEIGHT / 2,
      fill: this.containerFill_, 'pointer-events': 'all',
    }, root);
    root.insertBefore(container, this.getTextElement());

    let x = PADDING_X;
    SEGMENTS.forEach((segment) => {
      const rect = Blockly.utils.dom.createSvgElement('rect', {
        x: x + 1, y: 2, width: segment.width - 2, height: HEIGHT - 4,
        rx: (HEIGHT - 4) / 2, ry: (HEIGHT - 4) / 2, 'pointer-events': 'none',
      }, root);
      const text = Blockly.utils.dom.createSvgElement('text', {
        x: x + segment.width / 2, y: HEIGHT / 2 + 1,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-size': '11pt', 'font-family': 'sans-serif', 'font-weight': 'normal',
        'pointer-events': 'none',
      }, root);
      text.textContent = segment.label;
      this.segmentRects_.push(rect);
      this.segmentTexts_.push(text);
      x += segment.width;
    });
    root.addEventListener('keydown', (event) => this.onKeyDown_(event));
    this.syncFromBlock_();
  }

  updateSize_() {
    super.updateSize_(0);
    this.size_.width = WIDTH;
    this.size_.height = HEIGHT;
    this.getTextElement()?.setAttribute('display', 'none');
    this.syncFromBlock_();
  }

  showEditor_(event) {
    const root = this.getSvgRoot();
    if (!root || !event || typeof event.clientX !== 'number') return this.selectNextMode_();
    const bounds = root.getBoundingClientRect();
    const x = Math.max(0, Math.min(WIDTH, (event.clientX - bounds.left) / bounds.width * WIDTH));
    let cursor = 0;
    const segment = SEGMENTS.find((candidate) => {
      cursor += candidate.width;
      return x < cursor + PADDING_X;
    }) || SEGMENTS[SEGMENTS.length - 1];
    this.selectMode_(segment.mode);
  }

  onKeyDown_(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const currentIndex = THRESHOLD_MODES.indexOf(getThresholdMode(this.getSourceBlock()));
    if (event.key === 'ArrowLeft') {
      this.selectMode_(THRESHOLD_MODES[(currentIndex + THRESHOLD_MODES.length - 1) % THRESHOLD_MODES.length]);
    } else if (event.key === 'ArrowRight') {
      this.selectMode_(THRESHOLD_MODES[(currentIndex + 1) % THRESHOLD_MODES.length]);
    } else {
      this.selectNextMode_();
    }
  }

  selectNextMode_() {
    const currentIndex = THRESHOLD_MODES.indexOf(getThresholdMode(this.getSourceBlock()));
    this.selectMode_(THRESHOLD_MODES[(currentIndex + 1) % THRESHOLD_MODES.length]);
  }

  selectMode_(mode) {
    const block = this.getSourceBlock();
    if (!block?.isEditable?.() || !THRESHOLD_MODES.includes(mode)) return;
    setThresholdMode(block, mode);
  }

  syncFromBlock_() {
    const mode = getThresholdMode(this.getSourceBlock());
    this.getSvgRoot()?.setAttribute('aria-label', `${this.ariaPrefix_}: ${mode.toLowerCase()}`);
    SEGMENTS.forEach((segment, index) => {
      const selected = segment.mode === mode;
      this.segmentRects_[index]?.setAttribute('fill', selected ? '#F4F4F4' : 'transparent');
      this.segmentTexts_[index]?.setAttribute('fill', selected ? '#000000' : this.unselectedText_);
    });
  }
}
