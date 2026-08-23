function valuesEqual(actual = [], expected = []) {
  const normalized = (values) => [...new Set(values)].sort();
  return JSON.stringify(normalized(actual)) === JSON.stringify(normalized(expected));
}

function actionEntities(automation) {
  return (automation?.actions || []).flatMap((action) => action?.target?.entity_id || []);
}

function triggerEntities(automation) {
  return (automation?.triggers || []).flatMap((trigger) => trigger?.entity_id || []);
}

export function evaluateBenchmarkCase(testCase, result) {
  const expected = testCase.expected;
  const checks = { status: expected.statuses.includes(result?.status) };
  if (result?.status === 'success') {
    const actions = result.automation?.actions || [];
    checks.service = expected.service
      ? actions.length === 1 && actions[0]?.service === expected.service
      : true;
    checks.action_entities = expected.action_entities
      ? valuesEqual(actionEntities(result.automation), expected.action_entities)
      : true;
    checks.trigger_entities = expected.trigger_entities
      ? valuesEqual(triggerEntities(result.automation), expected.trigger_entities)
      : true;
  }
  return { passed: Object.values(checks).every(Boolean), checks };
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}

function rate(rows, predicate) {
  if (!rows.length) return null;
  return rows.filter(predicate).length / rows.length;
}

function measuredRate(rows, key) {
  const applicable = rows.filter((row) => row.quality_applicable === true);
  return {
    applicable_cases: applicable.length,
    passed_cases: applicable.filter((row) => row[key] === true).length,
    rate: rate(applicable, (row) => row[key] === true),
  };
}

function latencySummary(rows) {
  const values = rows.map((row) => row.total_ms).filter(Number.isFinite);
  return {
    mean: values.length
      ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
      : null,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  };
}

export function orderedBenchmarkModels(models, repetition, caseIndex) {
  const forwardOrder = (caseIndex + repetition - 1) % 2 === 0;
  return forwardOrder ? [...models] : [...models].reverse();
}

export function benchmarkGoalAnalysisFields(result) {
  const analysis = result?.pipeline?.goal_analysis || result?.goal_analysis;
  return {
    goal_category: analysis?.goal_category || null,
    action_source: analysis?.action_source || null,
    target_scope: analysis?.target_scope || null,
    trigger_kind: analysis?.trigger_kind || null,
  };
}

export function summarizeBenchmarkRows(rows) {
  const completed = rows.filter((row) => !row.error);
  const llmRows = rows.filter((row) => row.provider !== 'local-fast-path');
  const ambiguityRows = rows.filter((row) => row.category === 'ambiguity');
  const calls = completed.flatMap((row) => row.ollama_calls || []);
  const repairs = calls.filter((call) => Number(call.attempt) > 1).length;
  const tokens = (key) => calls.reduce(
    (sum, call) => sum + (Number.isFinite(Number(call[key])) ? Number(call[key]) : 0),
    0,
  );
  return {
    cases: rows.length,
    completed_cases: completed.length,
    benchmark_success_rate: rate(rows, (row) => row.passed === true),
    llm_only_success_rate: rate(llmRows, (row) => row.passed === true),
    ambiguity_abstention_rate: {
      applicable_cases: ambiguityRows.length,
      passed_cases: ambiguityRows.filter((row) => (
        row.status === 'needs_clarification' || row.status === 'needs_confirmation'
      )).length,
      rate: rate(ambiguityRows, (row) => (
        row.status === 'needs_clarification' || row.status === 'needs_confirmation'
      )),
    },
    final_json_validation: measuredRate(rows, 'schema_valid'),
    entity_grounding: measuredRate(rows, 'grounded'),
    semantic_alignment: measuredRate(rows, 'semantic_aligned'),
    llm_only_final_json_validation: measuredRate(llmRows, 'schema_valid'),
    llm_only_entity_grounding: measuredRate(llmRows, 'grounded'),
    llm_only_semantic_alignment: measuredRate(llmRows, 'semantic_aligned'),
    repair_count: repairs,
    repairs_per_llm_case: llmRows.length ? repairs / llmRows.length : null,
    latency_ms: latencySummary(completed),
    llm_only_latency_ms: latencySummary(llmRows.filter((row) => !row.error)),
    tokens: {
      prompt: tokens('prompt_tokens'),
      generated: tokens('generated_tokens'),
      total: tokens('prompt_tokens') + tokens('generated_tokens'),
    },
  };
}
