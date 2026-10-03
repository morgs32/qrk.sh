import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../package.json', import.meta.url));
const bundledRuntime = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare } = await import(
  pathToFileURL(bundledRuntime.resolve('miniflare')).href
);
const { build } = await import(
  pathToFileURL(bundledRuntime.resolve('esbuild')).href
);
const directory = await mkdtemp(join(tmpdir(), 'zerospin-actor-staging-'));
let worker;
try {
  const bundle = join(directory, 'worker.mjs');
  await build({
    stdin: {
      contents: `export { ActorStaging, StagingAdmission, StagingSnapshotOwner, StagingPublication } from './actorStaging.ts'; import { stagingWorker } from './actorStaging.ts'; export default stagingWorker;`,
      resolveDir: resolve(import.meta.dirname, '../src/fixtures'),
      sourcefile: 'actor-staging-entry.ts',
    },
    alias: {
      config: resolve(
        import.meta.dirname,
        '../src/fixtures/actorStagingConfig.ts',
      ),
    },
    plugins: [
      {
        name: 'workerd-sqlite-wasm',
        setup(builder) {
          builder.onResolve({ filter: /sql-wasm\.wasm$/ }, () => ({
            path: './sql-wasm.wasm',
            external: true,
          }));
        },
      },
    ],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    external: ['cloudflare:workers'],
    outfile: bundle,
  });
  const script = await readFile(bundle, 'utf8');
  const wasm = await readFile(require.resolve('sql.js/dist/sql-wasm.wasm'));
  const bindings = {
    ACTOR_STAGING: 'ActorStaging',
    AGGREGATE_CHAIN: 'StagingAdmission',
    AGGREGATE_VERSION_REPO: 'StagingSnapshotOwner',
    AGGREGATE_ACTOR_VERSION_CHAIN: 'StagingPublication',
  };
  const start = () =>
    new Miniflare({
      resourcePersistencePath: join(directory, 'storage'),
      workers: [
        {
          config: {
            name: 'actor-staging-fixture',
            type: 'worker',
            compatibilityDate: '2026-09-01',
            compatibilityFlags: ['nodejs_compat'],
            manifest: {
              mainModule: 'worker.mjs',
              modulesRoot: directory,
              modules: {
                'worker.mjs': { type: 'esm', contents: script },
                'sql-wasm.wasm': { type: 'wasm', contents: wasm },
              },
            },
            env: Object.fromEntries(
              Object.entries(bindings).map(([name, exportName]) => [
                name,
                {
                  type: 'durable-object',
                  worker: 'actor-staging-fixture',
                  exportName,
                },
              ]),
            ),
            exports: Object.fromEntries(
              Object.values(bindings).map(name => [
                name,
                { type: 'durable-object', storage: 'sqlite' },
              ]),
            ),
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
  const restart = async () => {
    await worker.dispose();
    worker = start();
  };
  const one = rows => rows.find(row => row.id === 'itm_one');
  worker = start();
  const staged = await request('/main/stage');
  assert.deepEqual(
    staged.result.map(row => row.stagingFailure?.code ?? null),
    [null, 'rejected', null],
  );
  assert.deepEqual(
    staged.pending.map(row => row.stageIndex),
    [1, 2],
  );
  assert.equal(staged.commands.length, 2);
  assert.equal(staged.outbox.length, 2);
  assert.equal(one(staged.resources).amount, 1);
  assert.equal(one(staged.optimistic.resources).amount, 4);
  assert.equal(
    staged.optimistic.selected.length,
    3,
    'relationship selection enters from the full confirmed resource graph',
  );
  assert.deepEqual(staged.calls, { guard: 3, program: 2, mapper: 0 });
  const created = staged.optimistic.resources.find(
    row => row.name === 'prepared',
  );
  assert.ok(created);
  const duplicate = await request('/main/duplicate');
  assert.deepEqual(duplicate.pending, staged.pending);
  assert.deepEqual(duplicate.calls, staged.calls);
  const conflict = await request('/main/conflict');
  assert.match(conflict.result.failure, /staging-command-identity-mismatch/);
  assert.deepEqual(conflict.pending, staged.pending);
  const snapshot = await request('/main/snapshot');
  assert.equal(snapshot.result.executedIndex, 0);
  assert.deepEqual(
    snapshot.result.resources.map(row => row.id),
    ['itm_one'],
  );
  assert.equal(
    snapshot.result.resources[0].amount,
    1,
    'snapshot excludes server optimism',
  );
  console.log(
    'PASS: ordered actor guards, independent staging rejection, mapped-original staging, duplicate/collision checks and authoritative snapshot',
  );

  await request('/main/admit-before-restart');
  await restart();
  const recovered = await request('/main/read');
  assert.deepEqual(recovered.pending, staged.pending);
  assert.deepEqual(recovered.optimistic, staged.optimistic);
  assert.deepEqual(recovered.calls, { guard: 0, program: 0, mapper: 0 });
  const drained = await request('/main/drain');
  assert.equal(drained.outbox.length, 0);
  assert.equal(
    drained.admissions.length,
    2,
    'uncertain delivery does not admit the first command twice',
  );
  assert.deepEqual(
    drained.admissions.map(row => row.id),
    ['cmd_first', 'cmd_second'],
  );
  assert.deepEqual(
    drained.pending.map(row => row.resolvedAt),
    [null, null],
    'delivery acknowledgement does not resolve optimism',
  );
  assert.deepEqual(drained.optimistic, staged.optimistic);
  assert.deepEqual(drained.calls, recovered.calls);
  console.log(
    'PASS: durable SQLite restart preserves prepared IDs/timestamps; uncertain admission retries saved commands without preparing again',
  );

  const rebased = await request('/main/rebase');
  assert.equal(one(rebased.resources).amount, 10);
  assert.equal(one(rebased.optimistic.resources).amount, 4);
  assert.equal(
    one(rebased.optimistic.resources).name,
    'new-confirmed',
    'saved updates do not overwrite unrelated newer confirmed columns',
  );
  assert.deepEqual(
    rebased.optimistic.resources.find(row => row.id === created.id),
    created,
  );
  const refused = await request('/main/missing-row');
  assert.deepEqual(refused.optimistic.unapplied, ['cmd_first', 'cmd_second']);
  assert.deepEqual(refused.pending, rebased.pending);
  assert.equal(
    refused.optimistic.resources.some(row => row.id === created.id),
    false,
    'one failed replay rolls back its other operations',
  );
  assert.deepEqual(refused.optimistic.selected, []);
  assert.equal(refused.outbox.length, 0, 'reconstruction does not resubmit');
  console.log(
    'PASS: optimistic rebase preserves newer columns; unreplayable commands stay pending without partial operations or resubmission',
  );

  const failed = await request('/failed/commit-failure');
  assert.equal(failed.pending.length, 0);
  assert.equal(failed.commands.length, 0);
  assert.equal(failed.outbox.length, 0);
  assert.equal(one(failed.optimistic.resources).amount, 1);
  const concurrent = await request('/concurrent/concurrent');
  assert.equal(concurrent.pending.length, 1);
  assert.equal(concurrent.outbox.length, 1);
  assert.equal(concurrent.commands.length, 1);
  console.log(
    'PASS: staging commit failure exposes no speculative state; concurrent same-command staging retains one submission',
  );

  await request('/admission/stage-rejected-admission');
  const admission = await request('/admission/drain');
  assert.equal(admission.outbox.length, 0);
  assert.ok(admission.pending[0].resolvedAt);
  assert.equal(one(admission.resources).amount, 1);
  assert.equal(one(admission.optimistic.resources).amount, 1);
  assert.deepEqual(admission.state, []);
  assert.equal(JSON.parse(admission.commands[0].admission).status, 'failed');
  await restart();
  const rejectedRestart = await request('/admission/read');
  assert.deepEqual(rejectedRestart.pending, admission.pending);
  assert.deepEqual(rejectedRestart.optimistic, admission.optimistic);
  console.log(
    'PASS: terminal admission refusal removes optimism durably without moving authoritative resources or checkpoints',
  );

  await request('/projection/stage');
  const rolledBack = await request('/projection/projection-failure');
  assert.equal(one(rolledBack.resources).amount, 1);
  assert.deepEqual(rolledBack.state, []);
  assert.equal(rolledBack.publications.length, 0);
  assert.deepEqual(
    rolledBack.pending.map(row => row.resolvedAt),
    [null, null],
  );
  const projected = await request('/projection/project');
  assert.equal(one(projected.resources).amount, 2);
  assert.equal(one(projected.optimistic.resources).amount, 4);
  assert.ok(projected.pending[0].resolvedAt);
  assert.equal(projected.pending[1].resolvedAt, null);
  assert.equal(projected.state[0].executedIndex, 1);
  assert.equal(projected.publications.length, 1);
  const published = await request('/projection/snapshot');
  assert.equal(published.result.executedIndex, 1);
  assert.equal(
    published.result.resources.find(row => row.id === 'itm_one').amount,
    2,
  );
  assert.equal(
    published.publications.length,
    0,
    'snapshot waits for publication acknowledgement',
  );
  await request('/execution/stage');
  const execution = await request('/execution/execution-rejected');
  assert.equal(one(execution.resources).amount, 1);
  assert.equal(one(execution.optimistic.resources).amount, 4);
  assert.ok(execution.pending[0].resolvedAt);
  assert.equal(execution.state[0].executedIndex, 1);
  assert.equal(JSON.parse(execution.commands[0].execution).status, 'failed');
  assert.equal(JSON.parse(execution.commands[0].admission).status, 'succeeded');
  console.log(
    'PASS: terminal projection/publication/resolution rollback together; duplicate delivery and execution rejection preserve phase ownership',
  );
} finally {
  await worker?.dispose();
  await rm(directory, { recursive: true, force: true });
}
