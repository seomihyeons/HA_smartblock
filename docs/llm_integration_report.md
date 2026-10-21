# LLM research integration verification

Date: 2026-10-21 (Asia/Seoul). Branch: `research/llm-agent`.

## Base and preservation

The integration starts at current remote main `d1bf5ae748b76c54ea8c3fa4cc4fc09f0213bbb7` (PR #28), rather than renaming or merging the old LLM branch. The earlier analysis used main `0ee392547`; fetching for integration found PR #28. Local main remains `fb4de41aaa3f103bcec025c797b4fb51da73f1c1`.

Before integration, 83 source/data files were copied to a private sibling backup outside Git and verified using SHA-256. Environment files, credentials, caches, model weights and runtime logs were excluded. The manifest records original branch refs, Git status and hashes. The original dirty worktree was never checked out, reset, cleaned, staged or committed. Its file hashes/status and all pre-existing local branch pointers were rechecked unchanged before committing this research branch.

Main's `src/data`, `src/blocks`, `src/import`, `src/generators`, block search, toolbox and theme remain unchanged. `src/index.js` adds only the Assistant import/initialization inside the existing async bootstrap. Assistant styles are scoped and do not override the existing analyzer, regression or block search panels. Existing Regression Test behavior is retained; two modules only add `.js` import suffixes for running the existing function under Node.

## Selective source integration

| Source | Integrated content |
|---|---|
| `feature/llm-automation-assistant` at `9e29f29079008c4a0fb3caf9d41437d7bee89f51` | Goal analysis, legacy Ollama planning, IR schema, capability/entity retrieval foundations, provider abstraction, tests/benchmarks, conflict-draft comparison |
| `feature/capability-driven-llm` local tip `8e8fe2d6187656073ffc788e3f614683e7bdf4fa` | Same LLM modules as the preceding branch; conversion/search work was compared with and superseded by the newer main implementation |
| Preserved uncommitted research source | Expanded intent router, information queries and target selectors, final response generation, interaction references, FastEmbed/cache and tests |
| Previously ignored dependencies | `embedding.py`, embedding tests, requirements and `modules/core/metrics.py`, explicitly included in the research commit |

`llm_integration_sources.json` records source commit IDs and hashes before adaptation. Unsaved non-LLM UI/import/theme changes remain in the original worktree and private backup; they were not substituted for newer main code. The previously ignored corpus module is backed up, but is not reintroduced as a required runtime import. No old branch is deleted.

## Integration fixes

1. Restored Assistant HTML and initialization without replacing main bootstrap/runtime selectors.
2. Added the same Python intent/plan transport for all five providers, including Ollama; adapted retained legacy Node results to the host contract.
3. Added missing Python source and explicit core/cloud/optional-embedding dependencies. No local `.env` is packaged or committed.
4. Added recursive Python grounding/dialect checks. Accepted automation additionally uses actual main Blockly import/generation plus semantic and field-preservation checks. Raw preservation is distinct from native visual support.
5. Removed automatic execution from message handling. Only an explicit Execute request with `confirmed: true` and a one-time 60-second preview can call HA. Medium/high-risk services remain draft-only; live service metadata is refreshed for preview and execution. Service data names and basic advertised numeric/boolean/text constraints are checked again at Execute.
6. Distinguished HA request acceptance from expected HA-state observation. Unknown/data-bearing effects are not claimed verified. Failed/ambiguous execution outcomes consume the preview and are not retried automatically.
7. Fixed information result-kind mapping and attribute-value fallback; added dynamic allowlisted properties and zero-count/empty-list handling.
8. Added the add-on API proxy, three-process startup and source-only root build context. Stable release publishing is not triggered by research pushes.

## Executed verification

| Check | Result |
|---|---|
| Node `npm test` | 151 passed, 0 failed; includes inherited main tests, study entity/filter/toolbox tests, mock generation/control/information, actual UI DOM interactions and stdin-only Conflict Analyzer |
| Python unittest discovery | 18 passed, 0 failed; fake provider/embedding/Ollama responses only |
| Production Webpack build | Passed; 3 bundle-size/performance warnings |
| Public YAML corpus via existing `runTaskAltBatch` | 877 files in both main and research; 372 PASS, 324 PASS_WITH_NORMALIZATION, 170 PASS_WITH_RAW, 11 FAIL; **0 new regressions** |
| Source-only Docker context and core image build | Passed using frozen `npm ci`; cloud SDK build option was not enabled |
| Network-isolated core container Python tests | 18 passed |
| Network-isolated core container HTTP/add-on proxy tests | 4 passed |
| Actual default container startup, `--network none` | HTML on 8099 -> Node proxy on 8787 -> Python provider catalog on 8792 connected; temporary container stopped afterwards |
| Original worktree and pre-existing branch refs | Unchanged |

The corpus comparison uses the same synthetic dropdown context and existing study filters for both versions. The 11 failures are inherited outcomes in this context, not 11 new LLM failures and not a claim that all corpus automations work in a connected home. They are retained in `llm_regression_results.json`; no changes to main conversion behavior were made to force this comparison to pass.

No real Home Assistant state request, service call, automation save or live model/provider request was made. Docker runtime checks blocked external networking. Mock test counts are not model accuracy or physical-device success rates. Real cloud SDK image installation, ARM image builds, real model generation, live FastEmbed downloads, performance and actual HA operation remain unverified. The cloud transports/dependencies are present; the optional cloud image variant is a separate verification task.

## Remaining work and poster claims

The current result is a deployable core prototype with tested host contracts for natural-language automation drafts, visual import/editing, explicit-confirmation control, read-only information queries and optional conflict analysis. These are architectural/prototype contributions suitable for a poster when accompanied by the mock/integration validation scope above.

Before claiming operational accuracy or deleting old branches, run a separate approved live-provider/HA evaluation, review the selective source ledger and retain the source backup. Do not claim general HA syntax coverage, physical safety guarantees, continuous real-time monitoring, improved latency/multilingual accuracy or user-study effectiveness from these tests. Area-registry joins, unrestricted multi-step routines, final-prose factuality validation, generic attribute-effect verification, and the inherited corpus failures remain open work.

The old branches are intentionally not merge ancestors of this selective integration. `git branch --merged` is therefore not a completeness test. Deletion still requires the user's separate approval; retaining them for now preserves provenance and any intentionally unported work.
