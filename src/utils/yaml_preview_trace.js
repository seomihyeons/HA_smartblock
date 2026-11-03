const KIND_BY_RULE_INPUT = { EVENT: 'trigger', CONDITION: 'condition', ACTION: 'action' };

function isRuleBlock(block) {
  return block?.type === 'event_action' || block?.type === 'event_condition_action';
}

function getHighlightKind(block) {
  if (!block) return null;
  if (isRuleBlock(block)) return 'rule';
  const rule = block.getRootBlock?.();
  if (!isRuleBlock(rule)) {
    const checks = block?.previousConnection?.getCheck?.() || [];
    const list = Array.isArray(checks) ? checks : [checks];
    if (list.includes('HA_EVENT')) return 'trigger';
    if (list.includes('HA_CONDITION')) return 'condition';
    if (list.includes('HA_ACTION')) return 'action';
    return null;
  }
  for (const [inputName, kind] of Object.entries(KIND_BY_RULE_INPUT)) {
    const sectionRoot = rule.getInputTargetBlock?.(inputName);
    if (sectionRoot && (sectionRoot === block || sectionRoot.getDescendants(false).includes(block))) return kind;
  }
  return 'rule';
}

function getLineRange(yaml, range) {
  if (!range || range.end <= range.start) return null;
  const start = Math.max(0, Math.min(range.start, yaml.length));
  const end = Math.max(start, Math.min(range.end, yaml.length));
  return {
    startLine: yaml.slice(0, start).split('\n').length - 1,
    endLine: yaml.slice(0, Math.max(start, end - 1)).split('\n').length - 1,
  };
}

/** Renders a source-mapped YAML preview without changing the YAML text. */
export function renderYamlPreview(host, { yaml = '', ranges = new Map() } = {}, selectedBlock = null) {
  if (!host) return;
  const lineRange = getLineRange(String(yaml), selectedBlock ? ranges.get(selectedBlock.id) : null);
  const kind = lineRange ? getHighlightKind(selectedBlock) : null;
  host.replaceChildren();
  String(yaml).split('\n').forEach((text, index) => {
    const line = document.createElement('span');
    const classes = ['yaml-trace-line'];
    if (lineRange && index >= lineRange.startLine && index <= lineRange.endLine) {
      classes.push('yaml-trace-highlight', `yaml-trace-${kind || 'rule'}`);
      if (lineRange.startLine === lineRange.endLine) classes.push('yaml-trace-single');
      else if (index === lineRange.startLine) classes.push('yaml-trace-start');
      else if (index === lineRange.endLine) classes.push('yaml-trace-end');
      else classes.push('yaml-trace-middle');
    }
    line.className = classes.join(' ');
    line.textContent = text;
    host.appendChild(line);
  });
  host.querySelector('.yaml-trace-start, .yaml-trace-single')?.scrollIntoView?.({ block: 'nearest' });
}
