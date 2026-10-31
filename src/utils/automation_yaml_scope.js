import { yamlGenerator } from '../generators/yaml.js';

const RULE_TYPES = new Set(['event_action', 'event_condition_action']);
const TRACE_OPEN = '\uE000';
const TRACE_CLOSE = '\uE001';

function isRuleBlock(block) {
  return Boolean(block && RULE_TYPES.has(block.type));
}

function hasRuleContent(block) {
  return ['EVENT', 'CONDITION', 'ACTION']
    .some((inputName) => Boolean(block.getInputTargetBlock?.(inputName)));
}

function finishGeneratedCode(generator, code) {
  let result = generator.finish(code.join('\n'));
  result = result.replace(/^\s+\n/, '');
  result = result.replace(/\n\s+$/, '\n');
  return result.replace(/[ \t]+\n/g, '\n');
}

function getScopedRoots(workspace) {
  const topBlocks = workspace.getTopBlocks(true);
  const rules = topBlocks.filter(isRuleBlock);
  return rules.length ? rules.filter(hasRuleContent) : topBlocks;
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
    if (match[1] === 'S') {
      starts.set(token, cleanYaml.length);
    } else if (starts.has(token)) {
      ranges.set(traceBlocks.get(token), {
        start: starts.get(token),
        end: cleanYaml.length,
      });
    }
    cursor = marker.lastIndex;
  }
  cleanYaml += markedYaml.slice(cursor);
  return { yaml: cleanYaml, ranges };
}

function insertTraceEndBeforeTerminalNewlines(code, token) {
  const terminalNewlines = code.match(/\n*$/)?.[0] || '';
  const body = code.slice(0, code.length - terminalNewlines.length);
  return `${body}${TRACE_OPEN}E${token}${TRACE_CLOSE}${terminalNewlines}`;
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
      try {
        generated = originalBlockToCode.call(this, block, ...args);
      } finally {
        activeTraceTokens.delete(block.id);
      }
      if (!generated || Array.isArray(generated)) return generated;
      return `${TRACE_OPEN}S${token}${TRACE_CLOSE}${generated}`;
    };

    generator.scrub_ = function tracedScrub(block, code, thisOnly) {
      const token = activeTraceTokens.get(block?.id);
      if (token === undefined) return originalScrub.call(this, block, code, thisOnly);

      // End this block's range before its next statement is appended. This is
      // the key distinction between a block's own YAML and the YAML produced
      // by later blocks in the same Trigger/Condition/Action chain.
      const ownCode = insertTraceEndBeforeTerminalNewlines(code, token);
      const nextBlock = block.nextConnection?.targetBlock();
      return nextBlock && !thisOnly
        ? ownCode + this.blockToCode(nextBlock)
        : ownCode;
    };
  }

  try {
    for (const block of roots) {
      let generated = generator.blockToCode(block);
      if (Array.isArray(generated)) generated = generated[0];
      if (generated) code.push(generated);
    }
    const generatedYaml = finishGeneratedCode(generator, code);
    return trace
      ? removeTraceMarkers(generatedYaml, traceBlocks)
      : { yaml: generatedYaml, ranges: new Map() };
  } finally {
    generator.blockToCode = originalBlockToCode;
    generator.scrub_ = originalScrub;
  }
}

/**
 * Returns the independent block groups that are excluded once at least one
 * Rule block is on the workspace. A chain is one group because only its top
 * block is returned by Blockly's getTopBlocks().
 */
export function getDisconnectedBlockGroups(workspace) {
  if (!workspace?.getTopBlocks) return [];
  const topBlocks = workspace.getTopBlocks(true);
  if (!topBlocks.some(isRuleBlock)) return [];
  return topBlocks.filter((block) => !isRuleBlock(block));
}

/**
 * Generates YAML according to the editor's two authoring modes:
 * - without a Rule block, preserve Blockly's existing all-top-block preview;
 * - with a Rule block, generate only Rules that have connected automation
 *   content, excluding independent blocks left on the workspace.
 */
export function generateScopedYaml(workspace) {
  if (!workspace?.getTopBlocks) return '';
  return generateFromRoots(workspace, getScopedRoots(workspace)).yaml;
}

/**
 * Returns scoped YAML plus exact character ranges for every statement-like
 * block that contributed to it. The temporary trace tokens are removed before
 * this result is exposed, so exported YAML remains unchanged.
 */
export function generateScopedYamlWithSourceMap(workspace) {
  if (!workspace?.getTopBlocks) return { yaml: '', ranges: new Map() };
  return generateFromRoots(workspace, getScopedRoots(workspace), { trace: true });
}
