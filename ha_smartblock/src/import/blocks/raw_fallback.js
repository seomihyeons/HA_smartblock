export function createRawLinesBlock(workspace, kind, rawLines) {
  const typeByKind = {
    event: 'ha_event_raw_lines',
    condition: 'ha_condition_raw_lines',
    action: 'ha_action_raw_lines',
  };

  const type = typeByKind[kind];
  const b = workspace.newBlock(type);

  const text = (rawLines || []).join('\n').replace(/\s+$/, '') + '\n';
  b.setFieldValue(text, 'RAW_LINES');

  b.initSvg?.();
  b.render?.();
  return b;
}
