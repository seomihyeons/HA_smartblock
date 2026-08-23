import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { createAutomationDraft } from '../llm_draft_service.mjs';
import {
  AUTOMATION_AB_DATASET_VERSION,
  automationCases,
  entityCards,
} from './automation_ab_dataset.mjs';
import {
  benchmarkGoalAnalysisFields,
  evaluateBenchmarkCase,
  summarizeBenchmarkRows,
} from './benchmark_metrics.mjs';
import { collectBenchmarkMetadata } from './benchmark_metadata.mjs';

function argument(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const models = argument('models', 'gemma3:4b,qwen3:4b-q4_K_M')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const repetitions = positiveInteger(argument('repetitions', '4'), 4);
const warmupEnabled = argument('warmup', 'true').toLocaleLowerCase() !== 'false';
const requestedCaseIds = argument('cases', '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const selectedCases = requestedCaseIds.length
  ? automationCases.filter((testCase) => requestedCaseIds.includes(testCase.id))
  : automationCases;
const unknownCaseIds = requestedCaseIds.filter(
  (caseId) => !automationCases.some((testCase) => testCase.id === caseId),
);
if (unknownCaseIds.length) {
  throw new Error(`Unknown benchmark case(s): ${unknownCaseIds.join(', ')}`);
}
const outputPath = path.resolve(argument(
  'output',
  `server/benchmarks/results/automation-ab-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
));

const allowedEnvironment = [
  'OLLAMA_BASE_URL',
  'OLLAMA_KEEP_ALIVE',
  'OLLAMA_SEED',
  'LLM_REQUEST_TIMEOUT_MS',
  'LLM_MAX_ENTITY_CARDS',
].reduce((result, key) => {
  if (process.env[key]) result[key] = process.env[key];
  return result;
}, {});

function compactRow(model, repetition, testCase, result, elapsedMs) {
  const evaluation = evaluateBenchmarkCase(testCase, result);
  const calls = result?.pipeline?.ollama_calls || result?.ollama_calls || [];
  const qualityApplicable = Boolean(testCase.expected.service);
  const validationErrors = [
    ...(result?.validation?.errors || []),
    ...(result?.semantic_validation?.errors || []),
  ].map((error) => String(error).slice(0, 300)).slice(0, 8);
  return {
    model,
    repetition,
    case_id: testCase.id,
    category: testCase.category,
    provider: result?.provider || null,
    status: result?.status || 'failure',
    passed: evaluation.passed,
    checks: evaluation.checks,
    ...benchmarkGoalAnalysisFields(result),
    quality_applicable: qualityApplicable,
    schema_valid: qualityApplicable ? result?.validation?.schema_valid === true : null,
    grounded: qualityApplicable ? result?.validation?.grounded === true : null,
    semantic_aligned: qualityApplicable
      ? result?.semantic_validation?.aligned === true
      : null,
    failure_stage: result?.status === 'failure' ? result?.pipeline?.stage || null : null,
    validation_errors: validationErrors,
    total_ms: elapsedMs,
    pipeline_timings_ms: result?.pipeline?.timings_ms || null,
    ollama_calls: calls.map((call) => ({
      stage: call.stage,
      attempt: call.attempt,
      total_ms: call.total_ms,
      load_ms: call.load_ms,
      prompt_eval_ms: call.prompt_eval_ms,
      generation_ms: call.generation_ms,
      prompt_tokens: call.prompt_tokens,
      generated_tokens: call.generated_tokens,
    })),
  };
}

async function readOllamaMetadata() {
  const baseUrl = (allowedEnvironment.OLLAMA_BASE_URL || 'http://127.0.0.1:11434')
    .replace(/\/$/, '');
  try {
    const [versionResponse, tagsResponse] = await Promise.all([
      fetch(`${baseUrl}/api/version`),
      fetch(`${baseUrl}/api/tags`),
    ]);
    if (!versionResponse.ok || !tagsResponse.ok) return null;
    const version = await versionResponse.json();
    const tags = await tagsResponse.json();
    const selected = new Set(models);
    return {
      version: version.version || null,
      models: (tags.models || [])
        .filter((model) => selected.has(model.name))
        .map((model) => ({
          name: model.name,
          digest: model.digest || null,
          size: model.size || null,
        })),
    };
  } catch {
    return null;
  }
}

const ollamaMetadata = await readOllamaMetadata();
if (!ollamaMetadata) {
  throw new Error('Cannot read Ollama version and model metadata. Is Ollama running?');
}
const installedModels = new Set(ollamaMetadata.models.map((model) => model.name));
const missingModels = models.filter((model) => !installedModels.has(model));
if (missingModels.length) {
  throw new Error(`Install benchmark model(s) first: ${missingModels.join(', ')}`);
}
const reproducibility = collectBenchmarkMetadata({
  ollamaVersion: ollamaMetadata.version,
});

async function runCase(model, repetition, testCase) {
  const env = {
    ...allowedEnvironment,
    LLM_PROVIDER: 'ollama',
    OLLAMA_MODEL: model,
    OLLAMA_THINK: 'false',
  };
  const startedAt = performance.now();
  try {
    const result = await createAutomationDraft({
      command: testCase.command,
      entity_cards: entityCards,
    }, { env });
    return compactRow(
      model,
      repetition,
      testCase,
      result,
      Math.round(performance.now() - startedAt),
    );
  } catch (error) {
    return {
      model,
      repetition,
      case_id: testCase.id,
      category: testCase.category,
      provider: 'ollama',
      status: 'failure',
      passed: false,
      goal_category: null,
      action_source: null,
      target_scope: null,
      trigger_kind: null,
      quality_applicable: Boolean(testCase.expected.service),
      schema_valid: testCase.expected.service ? false : null,
      grounded: testCase.expected.service ? false : null,
      semantic_aligned: testCase.expected.service ? false : null,
      total_ms: Math.round(performance.now() - startedAt),
      error: String(error?.message || error).slice(0, 500),
      ollama_calls: [],
    };
  }
}

const rows = [];
if (warmupEnabled) {
  const warmupCase = selectedCases.find((testCase) => testCase.category === 'state_trigger')
    || automationCases.find((testCase) => testCase.category === 'state_trigger');
  for (const model of models) {
    process.stdout.write(`[warm-up] ${model} ${warmupCase.id}\n`);
    await runCase(model, 0, warmupCase);
  }
}
for (let repetition = 1; repetition <= repetitions; repetition += 1) {
  for (const testCase of selectedCases) {
    const caseIndex = selectedCases.indexOf(testCase);
    const forwardOrder = ((repetition - 1) * selectedCases.length + caseIndex) % 2 === 0;
    for (const model of forwardOrder ? models : [...models].reverse()) {
      const total = models.length * selectedCases.length * repetitions;
      process.stdout.write(
        `[${rows.length + 1}/${total}] ${model} ${testCase.id}\n`,
      );
      rows.push(await runCase(model, repetition, testCase));
    }
  }
}

const summaries = Object.fromEntries(models.map((model) => [
  model,
  summarizeBenchmarkRows(rows.filter((row) => row.model === model)),
]));
const report = {
  benchmark_version: '1.0.0',
  dataset_version: AUTOMATION_AB_DATASET_VERSION,
  generated_at: new Date().toISOString(),
  reproducibility,
  ollama: ollamaMetadata,
  configuration: {
    models,
    case_ids: selectedCases.map((testCase) => testCase.id),
    repetitions,
    think: false,
    temperature: 0,
    seed: positiveInteger(allowedEnvironment.OLLAMA_SEED, 42),
    fast_path_enabled: true,
    warmup_excluded: warmupEnabled,
  },
  summaries,
  rows,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(summaries, null, 2)}\nSaved ${outputPath}\n`);
