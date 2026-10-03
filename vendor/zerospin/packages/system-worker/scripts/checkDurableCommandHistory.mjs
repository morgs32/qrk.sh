import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../package.json', import.meta.url));
const runtime = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare } = await import(
  pathToFileURL(runtime.resolve('miniflare')).href
);
const { build } = await import(pathToFileURL(runtime.resolve('esbuild')).href);
const directory = await mkdtemp(join(tmpdir(), 'zerospin-command-history-'));
const bundle = join(directory, 'worker.mjs');
let worker;
try {
  await build({
    stdin: {
      contents: `export { CommandHistory, PendingAggregateHistory } from './durableCommandHistory.ts'; import { worker } from './durableCommandHistory.ts'; export default worker;`,
      resolveDir: resolve(import.meta.dirname, '../src/fixtures'),
      sourcefile: 'command-history-entry.ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    external: ['cloudflare:workers'],
    outfile: bundle,
  });
  const script = await readFile(bundle, 'utf8');
  const start = () =>
    new Miniflare({
      resourcePersistencePath: join(directory, 'storage'),
      workers: [
        {
          config: {
            name: 'command-history-fixture',
            type: 'worker',
            compatibilityDate: '2026-09-01',
            compatibilityFlags: ['nodejs_compat'],
            manifest: {
              mainModule: 'worker.mjs',
              modulesRoot: directory,
              modules: { 'worker.mjs': { type: 'esm', contents: script } },
            },
            env: {
              HISTORY: {
                type: 'durable-object',
                worker: 'command-history-fixture',
                exportName: 'CommandHistory',
              },
              PENDING: {
                type: 'durable-object',
                worker: 'command-history-fixture',
                exportName: 'PendingAggregateHistory',
              },
            },
            exports: {
              CommandHistory: { type: 'durable-object', storage: 'sqlite' },
              PendingAggregateHistory: {
                type: 'durable-object',
                storage: 'sqlite',
              },
            },
          },
          dev: { rootPath: directory },
        },
      ],
    });
  const request = async path => {
    const response = await worker.dispatchFetch(`http://fixture${path}`);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  worker = start();
  const committed = await request('/commit');
  assert.equal(committed.publications.length, 1);
  await worker.dispose();
  worker = start();
  // The process stopped after commit and before publication acknowledgement.
  const recovered = await request('/read');
  assert.deepEqual(recovered, committed);
  assert.equal(recovered.commands[0].id, 'cmd_origin');
  assert.equal(
    recovered.operations[0].body,
    '{"encodedAttributes":{"price":20}}',
  );
  for (const first of ['version', 'original']) {
    const other = first === 'version' ? 'original' : 'version';
    const pending = await request(`/pending/${first}/commit`);
    await request(`/pending/${first}/ack/${first}`);
    await worker.dispose();
    worker = start();
    const restarted = await request(`/pending/${first}/read`);
    assert.deepEqual(restarted[first], []);
    assert.deepEqual(restarted[other], pending[other]);
    assert.deepEqual(restarted.operations, pending.operations);
    assert.deepEqual(
      await request(`/pending/${first}/ack/${first}`),
      restarted,
    );
    const acknowledged = await request(`/pending/${first}/ack/${other}`);
    assert.deepEqual(acknowledged, {
      version: [],
      original: [],
      operations: [],
    });
  }
  console.log(
    'PASS: independent aggregate delivery deletion and complete pending replay material after SQLite restart in both acknowledgement orders',
  );
  console.log(
    'PASS: disposable workerd SQLite restart, interrupted owned publication after reactivation',
  );
} finally {
  await worker?.dispose();
  await rm(directory, { recursive: true, force: true });
}
