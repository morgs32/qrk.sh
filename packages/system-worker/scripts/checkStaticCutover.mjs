import fs from 'node:fs/promises';
import path from 'node:path';

const workspaceRoot = path.resolve(import.meta.dirname, '../../..');
const roots = ['packages', 'examples', 'e2e'];
const excludedDirectories = new Set([
  '.git',
  '.nx',
  '.wrangler',
  'dist',
  'drizzle',
  'lib',
  'node_modules',
  'tmp',
  'vendor',
]);
const sourceExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.json',
  '.jsonc',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
]);
const forbidden = [
  /generationId/i,
  /GenerationManifest/,
  /generation-drained/i,
  /GenerationWorker/,
  /GenerationLoopback/,
  /Supervisor/,
  /getDevDeployApi/,
  /getProductionDeployApi/,
  /DevDeployApi/,
  /ProductionDeployApi/,
  /worker[_-]loader/i,
  /dynamic-worker/i,
  /generation-artifacts/i,
  /compileGeneration/,
  /buildGenerationArtifacts/,
  /prepareGeneration/,
  /openGeneration/,
  /drainGeneration/,
  /retireGeneration/,
  /SystemWorkerResolver/,
  /WorkerExportsSystemWorkerResolver/,
  /systemWorkerName/,
  /RepoSupervisor/,
  /@cloudflare\/vitest-pool-workers/,
];

const failures = [];

async function inspectDirectory(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    const relativePath = path.relative(workspaceRoot, entryPath);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) {
        await inspectDirectory(entryPath);
      }
      continue;
    }
    if (
      !entry.isFile() ||
      !sourceExtensions.has(path.extname(entry.name)) ||
      entry.name === 'worker-configuration.d.ts' ||
      /^wrangler\.zerospin-dev\.\d+\.local\.json$/.test(entry.name) ||
      relativePath === 'packages/system-worker/scripts/checkStaticCutover.mjs'
    ) {
      continue;
    }
    const contents = await fs.readFile(entryPath, 'utf8');
    for (const pattern of forbidden) {
      if (pattern.test(relativePath) || pattern.test(contents)) {
        failures.push(`${relativePath}: ${pattern}`);
      }
    }
  }
}

for (const root of roots) {
  await inspectDirectory(path.join(workspaceRoot, root));
}

if (failures.length > 0) {
  throw new Error(
    `Static cutover scan found forbidden lifecycle source:\n${failures.join('\n')}`,
  );
}
