import { yamlGenerator } from '../generators/yaml.js';

const RULE_TYPES = new Set(['event_action', 'event_condition_action']);
const TRACE_OPEN = '\uE000';
const TRACE_CLOSE = '\uE001';

const isRuleBlock = (block) => Boolean(block && RULE_TYPES.has(block.type));
const hasRuleContent = (block) => ['EVENT', 'CONDITION', 'ACTION']
  .some((name) => Boolean(block.getInputTargetBlock?.(name)));

function finishGeneratedCode(generator, code) {
  let result = generator.finish(code.join('\n'));
  result = result.replace(/^\s+\n/, '').replace(/\n\s+$/, '\n');
  return result.replace(/[ \t]+\n/g, '\n');
}

function getScopedRoots(workspace) {
  const topBlocks = workspace.getTopBlocks(true);
  const rules = topBlocks.filter(isRuleBlock);
  return rules.length ? rules.filter(hasRuleContent) : topBlocks;
}

function collectBlocksFromRoots(roots) {
  const blocks = new Map();
  for (const root of roots || []) {
    for (const block of [root, ...(root?.getDescendants?.(false) || [])]) {
      if (block?.id) blocks.set(block.id, block);
    }
  }
  return [...blocks.values()];
}

function shouldTraceBlock(block) {
  return isRuleBlock(block) || Boolean(block?.previousConnection);
}

function removeTraceMarkers(markedYaml, traceBlocks) {
  const starts = new Map();
  const ranges = new Map();
  const marker = new RegExp(`${TRACE_OPEN}([SE])(\\d+)${TRACE_CLOSE}`, 'g');
  let cleanYaml = '';
  let cursor = 0;
  let match;
  while ((match = marker.exec(markedYaml))) {
    cleanYaml += markedYaml.slice(cursor, match.index);
    const token = Number(match[2]);
    if (match[1] === 'S') starts.set(token, cleanYaml.length);
    else if (starts.has(token)) ranges.set(traceBlocks.get(token), { start: starts.get(token), end: cleanYaml.length });
    cursor = marker.lastIndex;
  }
  cleanYaml += markedYaml.slice(cursor);
  // Marker insertion can leave indentation before a terminal newline. Keep
  // the preview text byte-for-byte aligned with generateScopedYaml().
  return {
    yaml: cleanYaml.replace(/[ \t]+\n/g, '\n').replace(/\n+$/, '\n'),
    ranges,
  };
}

function insertTraceEndBeforeTerminalNewlines(code, token) {
  const terminalNewlines = code.match(/\n*$/)?.[0] || '';
  return `${code.slice(0, code.length - terminalNewlines.length)}${TRACE_OPEN}E${token}${TRACE_CLOSE}${terminalNewlines}`;
}

function generateFromRoots(workspace, roots, { trace = false } = {}) {
  const generator = yamlGenerator;
  const code = [];
  generator.init(workspace);
  const originalBlockToCode = generator.blockToCode;
  const originalScrub = generator.scrub_;
  const traceBlocks = new Map();
  const activeTraceTokens = new Map();
  let traceToken = 0;

  if (trace) {
    generator.blockToCode = function tracedBlockToCode(block, ...args) {
      if (!shouldTraceBlock(block)) return originalBlockToCode.call(this, block, ...args);
      const token = traceToken++;
      traceBlocks.set(token, block.id);
      activeTraceTokens.set(block.id, token);
      let generated;
      try { generated = originalBlockToCode.call(this, block, ...args); }
      finally { activeTraceTokens.delete(block.id); }
      if (!generated || Array.isArray(generated)) return generated;
      return `${TRACE_OPEN}S${token}${TRACE_CLOSE}${generated}`;
    };
    generator.scrub_ = function tracedScrub(block, generatedCode, thisOnly) {
      const token = activeTraceTokens.get(block?.id);
      if (token === undefined) return originalScrub.call(this, block, generatedCode, thisOnly);
      const ownCode = insertTraceEndBeforeTerminalNewlines(generatedCode, token);
      const nextBlock = block.nextConnection?.targetBlock();
      return nextBlock && !thisOnly ? ownCode + this.blockToCode(nextBlock) : ownCode;
    };
  }

  try {
    for (const block of roots) {
      let generated = generator.blockToCode(block);
      if (Array.isArray(generated)) generated = generated[0];
      if (generated) code.push(generated);
    }
    const yaml = finishGeneratedCode(generator, code);
    return trace ? removeTraceMarkers(yaml, traceBlocks) : { yaml, ranges: new Map() };
  } finally {
    generator.blockToCode = originalBlockToCode;
    generator.scrub_ = originalScrub;
  }
}

/** Generates Rule content only when Rule roots are present; loose blocks stay excluded. */
export function generateScopedYaml(workspace) {
  if (!workspace?.getTopBlocks) return '';
  return generateFromRoots(workspace, getScopedRoots(workspace)).yaml;
}

/** Returns the unchanged generated YAML together with source ranges for preview highlighting. */
export function generateScopedYamlWithSourceMap(workspace) {
  if (!workspace?.getTopBlocks) return { yaml: '', ranges: new Map() };
  return generateFromRoots(workspace, getScopedRoots(workspace), { trace: true });
}

export function getDisconnectedBlockGroups(workspace) {
  if (!workspace?.getTopBlocks || !workspace.getTopBlocks(true).some(isRuleBlock)) return [];
  return workspace.getTopBlocks(true).filter((block) => !isRuleBlock(block));
}

export function getDisconnectedBlockSummary(workspace) {
  const groups = getDisconnectedBlockGroups(workspace);
  const blockIds = new Set();
  groups.forEach((group) => collectBlocksFromRoots([group]).forEach((block) => {
    if (!block.isShadow?.()) blockIds.add(block.id);
  }));
  return { groups, groupCount: groups.length, blockCount: blockIds.size };
}
