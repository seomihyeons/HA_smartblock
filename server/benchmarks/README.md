# Automation Model A/B Benchmark

This benchmark compares Ollama models through the same production automation-draft pipeline. It uses synthetic EntityCards and never reads from, saves to, or executes an automation in Home Assistant.

## Models

Install both exact model tags before running the comparison:

```powershell
ollama pull gemma3:4b
ollama pull qwen3:4b-q4_K_M
```

Qwen3 runs through Ollama's native `/api/chat` endpoint with `think: false`. Both models use `temperature: 0`, the same seed, prompts, JSON Schemas, EntityCards, case order, and repair limit.

## Run

Use at least four repetitions for a model-selection result:

```powershell
npm run benchmark:llm -- --repetitions=4
```

The runner performs one excluded warm-up per model. It alternates the leading model across cases and repetitions, and reports overall and LLM-only metrics. Four repetitions give each model the same number of first and second positions for every case. Manual light commands exercise the shared local fast path but are excluded from LLM-only comparisons.

To run a smoke check or override the model list:

```powershell
npm run benchmark:llm -- --repetitions=1
npm run benchmark:llm -- --models=gemma3:4b,qwen3:4b-q4_K_M --repetitions=4
npm run benchmark:llm -- --models=gemma3:4b --cases=ko_motion_specific_on --warmup=false
```

## Metrics

- end-to-end expected-result success rate
- LLM-only success rate
- ambiguity abstention rate (`needs_clarification` or `needs_confirmation`)
- final JSON Schema validation rate
- entity grounding rate
- semantic alignment rate
- repair count and repairs per LLM case
- mean, p50, and p95 wall-clock latency
- Ollama prompt and generated token counts

Quality rates use every case expected to produce an automation as their denominator. A model failure before draft creation counts as a failed validation, grounding, and alignment outcome instead of disappearing from the metric.

With a fixed seed and `temperature: 0`, repetitions primarily measure latency and runtime stability. Treat the distinct benchmark cases, rather than repeated deterministic runs, as the quality sample.

## Results And Privacy

Reports are written to `server/benchmarks/results/`, which is ignored by Git. They contain case IDs, status and validation checks, bounded validation errors, timings, model digests, token counts, the bounded goal-analysis fields `goal_category`, `action_source`, `target_scope`, and `trigger_kind`, plus the Git commit and clean/dirty state, Node and Ollama versions, OS platform/release/architecture, and CPU model/logical-core count. The dataset uses synthetic entity IDs, so validation errors cannot expose a real Home Assistant installation. Reports do not contain prompts, EntityCards, Home Assistant credentials, environment-variable values, actual entity IDs, model response text, hostnames, usernames, or filesystem paths.

Do not use `--output` to write a report into a tracked directory. Review the generated report before sharing it.
