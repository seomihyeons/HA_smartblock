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
  const above = block?.getFieldValue('USE_ABOVE') === 'TRUE';
  const below = block?.getFieldValue('USE_BELOW') === 'TRUE';
  return above && below ? 'BETWEEN' : above ? 'ABOVE' : below ? 'BELOW' : 'NONE';
}

export function setThresholdMode(block, mode) {
  if (!block || !THRESHOLD_MODES.includes(mode)) return;
  const above = mode === 'ABOVE' || mode === 'BETWEEN';
  const below = mode === 'BELOW' || mode === 'BETWEEN';
  block.isUpdatingThresholdMode_ = true;
  const group = Blockly.Events.getGroup();
  if (!group) Blockly.Events.setGroup(true);
  try {
    block.setFieldValue(above ? 'TRUE' : 'FALSE', 'USE_ABOVE');
    block.setFieldValue(below ? 'TRUE' : 'FALSE', 'USE_BELOW');
  } finally {
    block.isUpdatingThresholdMode_ = false;
    if (!group) Blockly.Events.setGroup(false);
  }
  block.updateThresholdUi_?.();
}

class VisibleNumber extends Blockly.FieldNumber {
  isSerializable() { return false; }
}

export function createVisibleThresholdNumber(role) {
  let field;
  // No precision quantisation: Home Assistant accepts decimal thresholds and
  // the visible editor must not silently turn 0.25 into 0.3.
  field = new VisibleNumber(0, null, null, null, (value) => {
    const block = field.getSourceBlock();
    if (!block || block.isSyncingThresholdUi_) return value;
    const mode = getThresholdMode(block);
    const target = role === 'SECONDARY' ? 'BELOW' : (mode === 'BELOW' ? 'BELOW' : 'ABOVE');
    if (mode !== 'NONE') block.setFieldValue(value, target);
    return value;
  });
  return field;
}

export class SegmentedThresholdModeField extends Blockly.FieldLabel {
  constructor({ fill = '#E7EDC9', label = 'Numeric threshold' } = {}) {
    super('', 'ha-segmented-threshold-text');
    this.fill_ = fill;
    this.label_ = label;
    this.rects_ = [];
    this.texts_ = [];
  }
  isClickable() { return true; }
  isClickableInFlyout() { return false; }
  initView() {
    super.initView();
    this.getTextElement()?.setAttribute('display', 'none');
    const root = this.getSvgRoot();
    if (!root || this.rects_.length) return;
    root.setAttribute('role', 'button'); root.setAttribute('tabindex', '0'); root.style.cursor = 'pointer';
    const outer = Blockly.utils.dom.createSvgElement('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: 11, ry: 11, fill: this.fill_, 'pointer-events': 'all' }, root);
    root.insertBefore(outer, this.getTextElement());
    let x = PADDING_X;
    SEGMENTS.forEach((segment) => {
      const rect = Blockly.utils.dom.createSvgElement('rect', { x: x + 1, y: 2, width: segment.width - 2, height: HEIGHT - 4, rx: (HEIGHT - 4) / 2, ry: (HEIGHT - 4) / 2, 'pointer-events': 'none' }, root);
      const text = Blockly.utils.dom.createSvgElement('text', {
        x: x + segment.width / 2, y: HEIGHT / 2 + 1,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-size': '11pt', 'font-family': 'sans-serif', 'font-weight': 'normal',
        'pointer-events': 'none',
      }, root);
      text.textContent = segment.label; this.rects_.push(rect); this.texts_.push(text); x += segment.width;
    });
    root.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      const index = Math.max(0, THRESHOLD_MODES.indexOf(getThresholdMode(this.getSourceBlock())));
      const next = event.key === 'ArrowLeft' ? (index + 2) % 3 : (index + 1) % 3;
      setThresholdMode(this.getSourceBlock(), THRESHOLD_MODES[next]);
    });
    this.syncFromBlock_();
  }
  updateSize_() { super.updateSize_(0); this.size_.width = WIDTH; this.size_.height = HEIGHT; this.getTextElement()?.setAttribute('display', 'none'); this.syncFromBlock_(); }
  showEditor_(event) {
    const bounds = this.getSvgRoot()?.getBoundingClientRect();
    if (!bounds || !event || typeof event.clientX !== 'number') return setThresholdMode(this.getSourceBlock(), THRESHOLD_MODES[0]);
    const ratio = (event.clientX - bounds.left) / bounds.width;
    setThresholdMode(this.getSourceBlock(), THRESHOLD_MODES[Math.min(2, Math.max(0, Math.floor(ratio * 3)))]);
  }
  syncFromBlock_() {
    const mode = getThresholdMode(this.getSourceBlock());
    this.getSvgRoot()?.setAttribute('aria-label', `${this.label_}: ${mode.toLowerCase()}`);
    SEGMENTS.forEach((segment, index) => {
      const selected = segment.mode === mode;
      this.rects_[index]?.setAttribute('fill', selected ? '#F4F4F4' : 'transparent');
      this.texts_[index]?.setAttribute('fill', selected ? '#000000' : '#6B7280');
    });
  }
}
