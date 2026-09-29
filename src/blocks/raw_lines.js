// src/blocks/raw_lines.js
import * as Blockly from 'blockly';

// Raw blocks display their YAML exactly as stored. In particular, the leading
// list marker (`- `) is meaningful source structure and must match the
// Condition/Event Raw block presentation.
export function rawActionDisplayLines(raw) {
  const lines = String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n$/, '')
    .split('\n');

  return lines.map((line) => line.trimEnd());
}

// Raw is an escape hatch, but it should not turn every ordinary fallback into
// a code panel. Keep the established compact, one-row presentation unless the
// action contains a control-flow tree whose nesting is useful to read.
export function shouldDisplayRawAsYaml(raw) {
  return /^\s*-?\s*(?:choose|if|repeat|parallel|sequence|wait_for_trigger|wait_template)\s*:/m.test(String(raw ?? ''));
}

function rawSingleLineDisplay(lines) {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
}

// A Raw Action is source code, not a vertical stack of Blockly inputs.  One
// SVG text field keeps one visible row per YAML line without inserting the
// renderer's extra row padding between lines.
class RawYamlCodeField extends Blockly.FieldLabel {
  constructor(value = '') {
    super(value, 'ha-raw-yaml-code');
    this.maxDisplayLength = Infinity;
  }

  render_() {
    super.render_();
    const textElement = this.textElement_;
    if (!textElement || typeof document === 'undefined') return;

    const lines = String(this.getValue() ?? '').split('\n');
    const constants = this.getConstants();
    // These are the active Blockly renderer/theme metrics, not a separate
    // Raw-block font or arbitrary line-height setting.
    const smallPadding = constants?.SMALL_PADDING || 4;
    // One half of Blockly's normal small spacer gives source code breathing
    // room without restoring the full empty DummyInput row between lines.
    const lineHeight = (constants?.FIELD_TEXT_HEIGHT || 16) + smallPadding / 2;
    const verticalPadding = smallPadding * 2;
    const widestLine = Math.max(1, ...lines.map((line) => line.length));
    textElement.replaceChildren();

    lines.forEach((line, index) => {
      const span = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      span.setAttribute('x', '0');
      // Preserve the one-line FieldLabel baseline that super.render_() has
      // already placed. Only subsequent YAML lines advance downward.
      span.setAttribute('dy', String(index === 0 ? 0 : lineHeight));
      // SVG collapses regular leading whitespace. Non-breaking spaces keep the
      // exact YAML indentation depth visible without changing RAW_LINES.
      span.textContent = (line || ' ').replace(/^ +/, (spaces) => '\u00a0'.repeat(spaces.length));
      textElement.appendChild(span);
    });

    // Use SVG's measured width when available. The character-count fallback
    // is only for headless tests; it must not clip long entity IDs in the UI.
    let contentWidth = widestLine * 7;
    try {
      contentWidth = Math.max(contentWidth, textElement.getBBox().width);
    } catch (_) {
      // getBBox is unavailable in a headless Blockly workspace.
    }
    this.size_.width = contentWidth + 2;
    this.size_.height = Math.max(lineHeight, lines.length * lineHeight + verticalPadding);
    // Do not reposition the text after expanding the field height: the
    // baseline established by super.render_() is precisely the baseline used
    // by a normal one-line Raw Action.
  }
}

function createRawLinesDefinition({ check, colour, tooltip }) {
  return {
  init() {
    // Keep the serializable source field hidden on the *same* input as the
    // visible code. A separate hidden DummyInput still consumes a full empty
    // Blockly row, which was the large gap above the first YAML line.
    this.appendDummyInput('RAW_CODE')
      .appendField(new Blockly.FieldLabelSerializable(''), 'RAW_LINES')
      .appendField(new Blockly.FieldLabel(' '), 'RAW_SINGLE')
      .appendField(new RawYamlCodeField(' '), 'RAW_MULTI');
    this.setPreviousStatement(true, check);
    this.setNextStatement(true, check);
    this.setColour(colour);
    this.setTooltip(tooltip);
    this.setHelpUrl('');

    const rawField = this.getField('RAW_LINES');
    rawField?.setVisible(false);
    const singleField = this.getField('RAW_SINGLE');
    const multiField = this.getField('RAW_MULTI');
    singleField.maxDisplayLength = Infinity;
    multiField?.setVisible(false);
    rawField?.setValidator((nextValue) => {
      this.updateRawLines_(nextValue);
      return nextValue;
    });
    this.updateRawLines_('');
  },

  updateRawLines_(rawValue) {
    const raw = String(rawValue ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = raw ? rawActionDisplayLines(raw) : [];
    const isMultiline = shouldDisplayRawAsYaml(raw);
    const singleField = this.getField('RAW_SINGLE');
    const multiField = this.getField('RAW_MULTI');
    singleField?.setVisible(!isMultiline);
    multiField?.setVisible(isMultiline);
    if (isMultiline) multiField?.setValue(lines.join('\n'));
    else singleField?.setValue(rawSingleLineDisplay(lines) || ' ');
    if (this.rendered) this.render();
  },
  };
}

// All Raw kinds use the same presentation contract: a compact native Blockly
// label by default, with source-code rendering reserved for control-flow YAML
// (such as a multi-branch choose). RAW_LINES remains the unmodified export
// source in every case.
const rawDefinitions = [
  {
    type: 'ha_metadata_raw_lines', check: 'HA_METADATA', colour: '3B4574',
    tooltip: 'Displays unsupported automation metadata YAML as-is. This block is read-only.',
  },
  {
    type: 'ha_event_raw_lines', check: 'HA_EVENT', colour: 180,
    tooltip: 'Displays unsupported trigger YAML as-is. This block is read-only.',
  },
  {
    type: 'ha_condition_raw_lines', check: 'HA_CONDITION', colour: 'AECA3E',
    tooltip: 'Displays unsupported condition YAML as-is. This block is read-only.',
  },
  {
    type: 'ha_action_raw_lines', check: 'HA_ACTION', colour: '#E3CC57',
    tooltip: 'Displays unsupported action YAML as-is. This block is read-only.',
  },
];

rawDefinitions.forEach(({ type, ...definition }) => {
  Blockly.Blocks[type] = createRawLinesDefinition(definition);
});

// Custom definitions register above. Keep this export for index.js's existing
// registration path without defining duplicate JSON block definitions.
export const rawLinesBlocks = [];
