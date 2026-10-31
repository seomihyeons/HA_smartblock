const HIGHLIGHT_KIND_BY_RULE_INPUT = {
  EVENT: 'trigger',
  CONDITION: 'condition',
  ACTION: 'action',
};

function isRuleBlock(block) {
  return block?.type === 'event_action' || block?.type === 'event_condition_action';
}

function getStandaloneBlockHighlightKind(block) {
  const checks = block?.previousConnection?.getCheck?.() || [];
  const checkList = Array.isArray(checks) ? checks : [checks];
  if (checkList.includes('HA_EVENT')) return 'trigger';
  if (checkList.includes('HA_CONDITION')) return 'condition';
  if (checkList.includes('HA_ACTION')) return 'action';
  return null;
}

function getBlockHighlightKind(block) {
  if (!block) return null;
  if (isRuleBlock(block)) return 'rule';

  const rule = block.getRootBlock?.();
  // A standalone statement block has no Rule input to identify its section.
  // Its previous-connection check is the same contract used by Blockly to
  // connect it to Rule EVENT/CONDITION/ACTION inputs.
  if (!isRuleBlock(rule)) return getStandaloneBlockHighlightKind(block);

  for (const [inputName, kind] of Object.entries(HIGHLIGHT_KIND_BY_RULE_INPUT)) {
    const sectionRoot = rule.getInputTargetBlock?.(inputName);
    if (!sectionRoot) continue;
    if (sectionRoot === block || sectionRoot.getDescendants(false).includes(block)) return kind;
  }
  return 'rule';
}

function getLineRange(yaml, range) {
  if (!range || range.end <= range.start) return null;
  const start = Math.max(0, Math.min(range.start, yaml.length));
  const end = Math.max(start, Math.min(range.end, yaml.length));
  const startLine = yaml.slice(0, start).split('\n').length - 1;
  const endLine = yaml.slice(0, Math.max(start, end - 1)).split('\n').length - 1;
  return { startLine, endLine };
}

function appendYamlLine(host, text, classNames) {
  const line = document.createElement('span');
  line.className = classNames.join(' ');
  line.textContent = text;
  host.appendChild(line);
}

/**
 * Renders a source-mapped YAML preview without changing its textual value.
 * Only one selected range is highlighted at once so the current Blockly
 * selection remains unambiguous.
 */
export function renderYamlPreview(host, { yaml = '', ranges = new Map() } = {}, selectedBlock = null) {
  if (!host) return;

  const range = selectedBlock ? ranges.get(selectedBlock.id) : null;
  const lineRange = getLineRange(yaml, range);
  const kind = lineRange ? getBlockHighlightKind(selectedBlock) : null;
  const lines = String(yaml).split('\n');

  host.replaceChildren();
  lines.forEach((text, index) => {
    const classNames = ['yaml-trace-line'];
    if (lineRange && index >= lineRange.startLine && index <= lineRange.endLine) {
      classNames.push('yaml-trace-highlight', `yaml-trace-${kind || 'rule'}`);
      if (lineRange.startLine === lineRange.endLine) classNames.push('yaml-trace-single');
      else if (index === lineRange.startLine) classNames.push('yaml-trace-start');
      else if (index === lineRange.endLine) classNames.push('yaml-trace-end');
      else classNames.push('yaml-trace-middle');
    }
    appendYamlLine(host, text, classNames);
  });

  const highlight = host.querySelector('.yaml-trace-start, .yaml-trace-single');
  highlight?.scrollIntoView?.({ block: 'nearest' });
}
