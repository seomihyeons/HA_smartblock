import { execFileSync } from 'node:child_process';
import os from 'node:os';
import process from 'node:process';

function gitOutput(args, options) {
  return String(options.execFileSync('git', args, {
    cwd: options.cwd,
    encoding: 'utf8',
    windowsHide: true,
  })).trim();
}

export function collectBenchmarkMetadata(options = {}) {
  const dependencies = {
    cwd: options.cwd || process.cwd(),
    execFileSync: options.execFileSync || execFileSync,
    nodeVersion: options.nodeVersion || process.version,
    platform: options.platform || os.platform,
    release: options.release || os.release,
    arch: options.arch || os.arch,
    cpus: options.cpus || os.cpus,
  };
  const cpuList = dependencies.cpus();
  const workingTreeStatus = gitOutput([
    'status',
    '--porcelain=v1',
    '--untracked-files=normal',
  ], dependencies);

  return {
    git: {
      commit: gitOutput(['rev-parse', 'HEAD'], dependencies),
      working_tree: workingTreeStatus ? 'dirty' : 'clean',
    },
    node_version: dependencies.nodeVersion,
    ollama_version: options.ollamaVersion || null,
    os: {
      platform: dependencies.platform(),
      release: dependencies.release(),
      arch: dependencies.arch(),
    },
    cpu: {
      model: String(cpuList[0]?.model || '').trim() || null,
      logical_cores: cpuList.length,
    },
  };
}
