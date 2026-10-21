import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHeadlessWorkspace } from '../server/blockly_runtime.mjs';
import { setStudyRuntimeEntities } from '../src/data/entities_index.js';
import { runTaskAltBatch } from '../test/task_alt/run_task_alt.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const paths = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(filename);
    else if (/\.ya?ml$/i.test(entry.name)) paths.push(filename);
  }
}
await visit(path.join(root, 'test'));
const files = await Promise.all(paths.sort().map(async (filename) => {
  const source = await readFile(filename, 'utf8');
  return { name: path.relative(root, filename).replaceAll('\\', '/'), text: async () => source, source };
}));
// Synthetic dropdown context for the public corpus only. No HA request,
// baseline write, automation save or service call is performed.
const ids = new Set(files.flatMap((file) => [...file.source.matchAll(/\b[a-z][a-z0-9_]*\.[A-Za-z0-9_]+\b/g)].map((match) => match[0])));
setStudyRuntimeEntities([...ids].map((entity_id) => ({ entity_id, state: entity_id.startsWith('sensor.') ? '0' : 'off', attributes: {
  friendly_name: entity_id,
  ...(/motion|pir/.test(entity_id) ? { device_class: 'motion' } : /door/.test(entity_id) ? { device_class: 'door' } : {}),
} })));
const workspace = createHeadlessWorkspace();
let results;
try { ({ results } = await runTaskAltBatch(files, workspace)); }
finally { workspace.dispose(); }
const counts = {};
for (const result of results) counts[result.status] = (counts[result.status] || 0) + 1;
const report = { context: 'synthetic public-corpus dropdowns, with existing study filtering', total: results.length, counts,
  files: Object.fromEntries(results.map(({ name, status }) => [name, status])) };
if (option('baseline')) {
  const baseline = JSON.parse(await readFile(option('baseline'), 'utf8'));
  const rank = (status) => ({ PASS: 0, PASS_WITH_NORMALIZATION: 0, PASS_WITH_RAW: 1, FAIL: 2, ERROR: 3 })[status] ?? 3;
  report.regressions = Object.entries(report.files).filter(([name, status]) => name in baseline.files && rank(status) > rank(baseline.files[name])).map(([name, status]) => ({ name, before: baseline.files[name], after: status }));
  process.exitCode = report.regressions.length ? 1 : 0;
} else process.exitCode = counts.FAIL || counts.ERROR ? 1 : 0;
if (option('output')) await writeFile(option('output'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ total: report.total, counts, regressions: report.regressions?.length }));
