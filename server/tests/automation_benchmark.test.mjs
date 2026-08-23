import test from 'node:test';
import assert from 'node:assert/strict';

import {
  benchmarkGoalAnalysisFields,
  evaluateBenchmarkCase,
  orderedBenchmarkModels,
  summarizeBenchmarkRows,
} from '../benchmarks/benchmark_metrics.mjs';
import { collectBenchmarkMetadata } from '../benchmarks/benchmark_metadata.mjs';

test('benchmark evaluator checks expected service and grounded targets', () => {
  const evaluation = evaluateBenchmarkCase({
    expected: {
      statuses: ['success'],
      service: 'light.turn_on',
      action_entities: ['light.target'],
      trigger_entities: ['binary_sensor.motion'],
    },
  }, {
    status: 'success',
    automation: {
      triggers: [{ entity_id: ['binary_sensor.motion'] }],
      actions: [{ service: 'light.turn_on', target: { entity_id: ['light.target'] } }],
    },
  });
  assert.equal(evaluation.passed, true);
});

test('benchmark summary separates fast-path rows and totals repairs and tokens', () => {
  const summary = summarizeBenchmarkRows([
    {
      provider: 'local-fast-path', status: 'success', passed: true, total_ms: 2,
      quality_applicable: true,
      schema_valid: true, grounded: true, semantic_aligned: true, ollama_calls: [],
    },
    {
      provider: 'ollama', status: 'success', passed: true, total_ms: 100,
      quality_applicable: true,
      schema_valid: true, grounded: true, semantic_aligned: true,
      ollama_calls: [
        { attempt: 1, prompt_tokens: 100, generated_tokens: 10 },
        { attempt: 2, prompt_tokens: 110, generated_tokens: 8 },
      ],
    },
  ]);
  assert.equal(summary.benchmark_success_rate, 1);
  assert.equal(summary.llm_only_success_rate, 1);
  assert.equal(summary.repair_count, 1);
  assert.equal(summary.final_json_validation.rate, 1);
  assert.equal(summary.llm_only_latency_ms.mean, 100);
  assert.deepEqual(summary.tokens, { prompt: 210, generated: 18, total: 228 });
});

test('quality rates include applicable cases that fail before producing a draft', () => {
  const summary = summarizeBenchmarkRows([
    {
      provider: 'ollama', status: 'failure', passed: false, total_ms: 50,
      quality_applicable: true, schema_valid: false, grounded: false,
      semantic_aligned: false, ollama_calls: [],
    },
    {
      provider: 'ollama', status: 'needs_clarification', passed: true, total_ms: 30,
      quality_applicable: false, schema_valid: null, grounded: null,
      semantic_aligned: null, ollama_calls: [],
    },
  ]);
  assert.deepEqual(summary.final_json_validation, {
    applicable_cases: 1,
    passed_cases: 0,
    rate: 0,
  });
  assert.equal(summary.llm_only_success_rate, 0.5);
});

test('ambiguity abstention rate counts only clarification and confirmation outcomes', () => {
  const summary = summarizeBenchmarkRows([
    {
      category: 'ambiguity', provider: 'ollama', status: 'needs_clarification',
      passed: true, total_ms: 10, ollama_calls: [],
    },
    {
      category: 'ambiguity', provider: 'local-fast-path', status: 'needs_confirmation',
      passed: true, total_ms: 1, ollama_calls: [],
    },
    {
      category: 'ambiguity', provider: 'ollama', status: 'success',
      passed: false, total_ms: 20, ollama_calls: [],
    },
  ]);

  assert.deepEqual(summary.ambiguity_abstention_rate, {
    applicable_cases: 3,
    passed_cases: 2,
    rate: 2 / 3,
  });
});

test('benchmark goal fields expose only bounded analysis classifications', () => {
  const fields = benchmarkGoalAnalysisFields({
    goal_analysis: {
      goal_category: 'lighting',
      action_source: 'unknown',
      target_scope: 'unspecified',
      trigger_kind: 'none',
      reason: 'must not be copied',
      evidence: { action_phrase: 'must not be copied' },
    },
  });

  assert.deepEqual(fields, {
    goal_category: 'lighting',
    action_source: 'unknown',
    target_scope: 'unspecified',
    trigger_kind: 'none',
  });
});

test('benchmark metadata records reproducibility fields without host or credential data', () => {
  const execFileSync = (_command, args) => {
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-parse') return '0123456789abcdef\n';
    throw new Error(`Unexpected Git arguments: ${args.join(' ')}`);
  };
  const metadata = collectBenchmarkMetadata({
    cwd: 'ignored-test-path',
    execFileSync,
    nodeVersion: 'v24.0.0-test',
    ollamaVersion: '0.32.14-test',
    platform: () => 'win32',
    release: () => 'test-release',
    arch: () => 'x64',
    cpus: () => [{ model: 'Test CPU' }, { model: 'Test CPU' }],
  });

  assert.deepEqual(metadata, {
    git: { commit: '0123456789abcdef', working_tree: 'clean' },
    node_version: 'v24.0.0-test',
    ollama_version: '0.32.14-test',
    os: { platform: 'win32', release: 'test-release', arch: 'x64' },
    cpu: { model: 'Test CPU', logical_cores: 2 },
  });
  assert.deepEqual(Object.keys(metadata).sort(), [
    'cpu', 'git', 'node_version', 'ollama_version', 'os',
  ]);
  assert.equal(JSON.stringify(metadata).includes('ignored-test-path'), false);
});

test('benchmark metadata marks a changed worktree as dirty', () => {
  const metadata = collectBenchmarkMetadata({
    execFileSync: (_command, args) => (
      args[0] === 'status' ? ' M server/file.mjs\n' : 'fedcba9876543210\n'
    ),
    cpus: () => [],
  });

  assert.equal(metadata.git.working_tree, 'dirty');
  assert.equal(metadata.cpu.model, null);
  assert.equal(metadata.cpu.logical_cores, 0);
});

test('benchmark model order alternates for every case across repetitions', () => {
  const models = ['model-a', 'model-b'];

  assert.deepEqual(orderedBenchmarkModels(models, 1, 0), ['model-a', 'model-b']);
  assert.deepEqual(orderedBenchmarkModels(models, 2, 0), ['model-b', 'model-a']);
  assert.deepEqual(orderedBenchmarkModels(models, 1, 1), ['model-b', 'model-a']);
  assert.deepEqual(orderedBenchmarkModels(models, 2, 1), ['model-a', 'model-b']);
  assert.deepEqual(models, ['model-a', 'model-b']);
});
