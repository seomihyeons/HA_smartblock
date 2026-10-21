import { cp, mkdir, copyFile, access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = process.argv[2];
if (!destination) throw new Error('Usage: node scripts/prepare_addon_context.mjs <new-build-directory>');
const target = path.resolve(destination);
if (target === root || root.startsWith(target + path.sep) || target.startsWith(root + path.sep)) throw new Error('Build context must be outside the repository in a separate directory.');
// Never clean/overwrite a previous artifact. An explicit fresh path is required.
try { await access(target); throw new Error('Build context already exists; choose a fresh directory.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(target, { recursive: true });
for (const name of ['Dockerfile', 'run.sh', 'config.yaml', '.dockerignore']) await copyFile(path.join(root, 'ha_smartblock', name), path.join(target, name));
await writeFile(path.join(target, 'run.sh'), (await readFile(path.join(target, 'run.sh'), 'utf8')).replace(/\r\n/g, '\n'));
const sourceOnly = { recursive: true, filter: (entry) => {
  const name = path.basename(entry);
  return !name.startsWith('.env') && !['__pycache__', '.venv', 'hf_cache', 'results'].includes(name) && !/\.(pyc|log)$/.test(name);
} };
await cp(path.join(root, 'ha_smartblock/server'), path.join(target, 'server'), sourceOnly);
await cp(path.join(root, 'server'), path.join(target, 'server'), sourceOnly);
for (const name of ['src', 'test', 'ha_llm_control']) await cp(path.join(root, name), path.join(target, name), sourceOnly);
for (const name of ['package.json', 'package-lock.json', 'webpack.config.js']) await copyFile(path.join(root, name), path.join(target, name));
console.log(`Prepared source-only research add-on context: ${target}`);
