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
const directory = await mkdtemp(join(tmpdir(), 'zerospin-repo-lifecycle-'));
let worker;
try {
  const entries = {
    standalone: `export { RepoLifecycleMigratable } from './repoLifecycleStandalone.ts'; import { repoLifecycleStandaloneWorker } from './repoLifecycleStandalone.ts'; export default repoLifecycleStandaloneWorker;`,
    standaloneInspector: `export { RepoLifecycleInspector as RepoLifecycleMigratable } from './repoLifecycleInspector.ts'; import { repoLifecycleStandaloneWorker } from './repoLifecycleStandalone.ts'; export default repoLifecycleStandaloneWorker;`,
    fixed: `export { RepoLifecycleAggregate, RepoLifecycleService, RepoLifecycleChain, RepoLifecycleSystem as SystemRepo } from './repoLifecycleFixed.ts'; import { repoLifecycleFixedWorker } from './repoLifecycleFixed.ts'; export default repoLifecycleFixedWorker;`,
    fixedInspector: `export { RepoLifecycleInspector as RepoLifecycleAggregate, RepoLifecycleInspector as RepoLifecycleService, RepoLifecycleInspector as RepoLifecycleChain } from './repoLifecycleInspector.ts'; export { RepoLifecycleSystem as SystemRepo } from './repoLifecycleFixed.ts'; import { repoLifecycleFixedWorker } from './repoLifecycleFixed.ts'; export default repoLifecycleFixedWorker;`,
  };
  const scripts = Object.fromEntries(
    await Promise.all(
      Object.entries(entries).map(async ([name, contents]) => {
        const bundle = join(directory, `${name}.mjs`);
        const result = await build({
          stdin: {
            contents,
            resolveDir: resolve(import.meta.dirname, '../src/fixtures'),
            sourcefile: `repo-lifecycle-${name}.ts`,
          },
          ...(name.startsWith('fixed')
            ? {
                alias: {
                  config: resolve(
                    import.meta.dirname,
                    '../src/fixtures/repoLifecycleConfig.ts',
                  ),
                },
              }
            : {}),
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
          metafile: true,
          outfile: bundle,
        });
        if (name === 'standalone') {
          assert.equal(
            Object.keys(result.metafile.inputs).some(path =>
              /\/(SystemRepo|makeFixedDORepo|getSystemSpec)\//.test(path),
            ),
            false,
            'standalone factory must not load system registration or config',
          );
        }
        return [name, await readFile(bundle, 'utf8')];
      }),
    ),
  );
  const wasm = await readFile(require.resolve('sql.js/dist/sql-wasm.wasm'));
  const start = (kind, inspector = false, migrationMode = 'base') => {
    const workerName = `repo-lifecycle-${kind}`;
    const bindings =
      kind === 'standalone'
        ? { REPO_LIFECYCLE_MIGRATABLE: 'RepoLifecycleMigratable' }
        : {
            REPO_LIFECYCLE_AGGREGATE: 'RepoLifecycleAggregate',
            REPO_LIFECYCLE_SERVICE: 'RepoLifecycleService',
            REPO_LIFECYCLE_CHAIN: 'RepoLifecycleChain',
            REPO_LIFECYCLE_SYSTEM: 'SystemRepo',
            SYSTEM_REPO: 'SystemRepo',
          };
    return new Miniflare({
      resourcePersistencePath: join(directory, kind, 'storage'),
      workers: [
        {
          config: {
            name: workerName,
            type: 'worker',
            compatibilityDate: '2026-09-01',
            compatibilityFlags: ['nodejs_compat'],
            manifest: {
              mainModule: 'worker.mjs',
              modulesRoot: directory,
              modules: {
                'worker.mjs': {
                  type: 'esm',
                  contents: scripts[`${kind}${inspector ? 'Inspector' : ''}`],
                },
                'sql-wasm.wasm': { type: 'wasm', contents: wasm },
              },
            },
            env: {
              ...(kind === 'fixed'
                ? { ZEROSPIN_SYSTEM_ID: { type: 'text', value: 'sys_fixture' } }
                : {}),
              LIFECYCLE_MIGRATION_MODE: { type: 'text', value: migrationMode },
              ...Object.fromEntries(
                Object.entries(bindings).map(([name, exportName]) => [
                  name,
                  { type: 'durable-object', worker: workerName, exportName },
                ]),
              ),
            },
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
  };
  const request = async path => {
    const response = await worker.dispatchFetch(`http://fixture${path}`);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const restart = async (kind, inspector = false, migrationMode = 'base') => {
    await worker?.dispose();
    worker = start(kind, inspector, migrationMode);
  };

  worker = start('standalone');
  const stored = await request('/main/store');
  assert.equal(stored.bootstrapped, 'true');
  assert.deepEqual(
    stored.migrations.map(row => row.id),
    [1, 2],
  );
  assert.deepEqual(stored.second, [{ value: 'once' }]);
  assert.equal(stored.records.length, 3);
  await restart('standalone');
  assert.deepEqual(await request('/main/read'), stored);
  console.log(
    'PASS: standalone config-free bundle; migrations stamp once and retain SQLite data/bootstrap across restart',
  );

  await restart('standalone', false, 'failed');
  const failedUpgrade = await request('/main/read');
  assert.match(
    failedUpgrade.failure,
    /Failed to apply migration 3|deliberately_missing_table/,
  );
  const failed = await request('/broken/read');
  assert.match(
    failed.failure,
    /Failed to apply migration 3|deliberately_missing_table/,
  );
  await restart('standalone', true);
  const failedStorage = await request('/main/read');
  assert.equal(failedStorage.bootstrapped, 'true');
  assert.equal(failedStorage.tables.includes('upgrade_migration'), false);
  assert.deepEqual(failedStorage.migrations, stored.migrations);
  assert.deepEqual(
    failedStorage.records,
    [...stored.records].sort((a, b) => a.key.localeCompare(b.key)),
  );
  const freshFailedStorage = await request('/broken/read');
  assert.equal(freshFailedStorage.bootstrapped, null);
  assert.equal(freshFailedStorage.tables.includes('upgrade_migration'), false);
  assert.equal(
    freshFailedStorage.migrations.some(row => row.id === 3),
    false,
  );
  await restart('standalone', false, 'fixed');
  const recovered = await request('/main/read');
  assert.equal(recovered.bootstrapped, 'true');
  assert.deepEqual(
    recovered.migrations.map(row => row.id),
    [1, 2, 3],
  );
  assert.deepEqual(recovered.migrations.slice(0, 2), stored.migrations);
  await restart('standalone', false, 'fixed');
  assert.deepEqual(await request('/main/read'), recovered);
  console.log(
    'PASS: failed migration rolls back its SQL and ledger stamp; earlier migration survives and retry completes once',
  );

  await restart('fixed');
  const initialized = await request('/system');
  assert.equal(initialized.initialized.result._tag, 'Success');
  assert.deepEqual(initialized.registrations.result.success, []);
  assert.deepEqual(initialized.aggregateVersions.result.success, []);
  assert.deepEqual(initialized.aggregateChains.result.success, []);
  const emptyCatalog = { repos: [], aggregates: [] };
  assert.deepEqual(await request('/registry'), emptyCatalog);
  const missingAggregate = await request('/aggregate/lifecycle/2.0.0');
  assert.match(missingAggregate.failure, /Aggregate version is not listed/);
  const missingService = await request('/service/lifecycle/2.0.0');
  assert.match(missingService.failure, /Service version is not listed/);
  assert.deepEqual(
    await request('/calls'),
    {},
    'unavailable versions fail before dbConfig resolution',
  );
  const denied = await request('/aggregate/lifecycle/1.0.0');
  assert.match(
    denied.failure,
    /aggregate-spec-not-accepted|has no accepted spec/,
  );
  const deniedCalls = Object.values(await request('/calls'));
  assert.equal(deniedCalls.length, 1);
  assert.ok(deniedCalls[0].dbConfig >= 1);
  assert.equal(deniedCalls[0].bootstrap, 0);
  const deniedChain = await request('/chain/lifecycle/acct_denied');
  assert.match(
    deniedChain.failure,
    /aggregate-spec-not-accepted|has no accepted spec/,
  );
  const deniedRegistration = await request(
    '/register-chain/lifecycle/acct_denied_registration',
  );
  assert.equal(deniedRegistration.result._tag, 'Failure');
  assert.deepEqual(await request('/registry'), emptyCatalog);
  const invalidIdentity = await request('/chain/lifecycle/invalid_id');
  assert.match(
    invalidIdentity.failure,
    /AggregateChain physical name has an invalid aggregateId/,
  );
  const wrongSystem = await request(
    '/chain/lifecycle/acct_wrong_system?systemId=sys_other',
  );
  assert.match(
    wrongSystem.failure,
    /AggregateChain must belong to the configured SystemRepo systemId/,
  );
  assert.deepEqual(await request('/registry'), emptyCatalog);
  await restart('fixed', true);
  for (const path of [
    '/aggregate/lifecycle/1.0.0',
    '/aggregate/lifecycle/2.0.0',
    '/service/lifecycle/2.0.0',
    '/chain/lifecycle/acct_denied',
    '/chain/lifecycle/invalid_id',
    '/chain/lifecycle/acct_wrong_system?systemId=sys_other',
  ]) {
    const storage = await request(path);
    assert.equal(storage.bootstrapped, null);
    assert.equal(storage.tables.includes('records'), false);
    assert.deepEqual(storage.records, []);
  }
  console.log(
    'PASS: real SystemRepo initializes without self-registration; refused specs, invalid aggregate IDs, and wrong-system chains leave both catalogs and child storage untouched',
  );

  await restart('fixed');
  const accepted = await request('/accept');
  assert.equal(accepted.result._tag, 'Success');
  const fixed = await request('/aggregate/lifecycle/1.0.0');
  assert.deepEqual(fixed.records, [{ key: 'bootstrap', value: 'once' }]);
  assert.equal(fixed.bootstrapped, 'true');
  assert.equal(Object.values(await request('/calls'))[0].bootstrap, 1);
  const catalog = await request('/system');
  assert.equal(catalog.initialized.result._tag, 'Success');
  assert.deepEqual(catalog.registrations.result.success, []);
  assert.deepEqual(
    catalog.aggregateVersions.result.success.map(row => row.tableNames),
    [['records']],
  );
  await restart('fixed');
  assert.deepEqual(await request('/aggregate/lifecycle/1.0.0'), fixed);
  assert.equal(Object.values(await request('/calls'))[0].bootstrap, 0);
  console.log(
    'PASS: actual spec acceptance admits fixed Repo registration; provision/bootstrap run once and remain retained after restart',
  );

  const versionOnlyCatalog = await request('/registry');
  assert.equal(versionOnlyCatalog.repos.length, 1);
  assert.deepEqual(versionOnlyCatalog.aggregates, []);
  const versionOnlyMembership = await request(
    '/catalog/lifecycle/acct_fixture',
  );
  assert.equal(versionOnlyMembership.exists.result._tag, 'Success');
  assert.equal(versionOnlyMembership.exists.result.success, false);
  assert.deepEqual(versionOnlyMembership.aggregateIds.result.success, []);
  const emptyAgentIds = await request('/agent-ids/lifecycle/1.0.0');
  assert.equal(emptyAgentIds.result._tag, 'Success');
  assert.deepEqual(emptyAgentIds.result.success, []);
  for (const path of [
    '/agent-ids/unknown/1.0.0',
    '/agent-ids/lifecycle/2.0.0',
  ]) {
    const unavailableAgentIds = await request(path);
    assert.equal(unavailableAgentIds.result._tag, 'Failure');
    assert.match(
      JSON.stringify(unavailableAgentIds.result.failure),
      /agent-aggregate-unavailable/,
    );
  }

  for (const path of [
    '/chain/lifecycle/acct_z',
    '/chain/lifecycle/acct_a',
    '/chain/lifecycle/acct_shared',
    '/chain/secondary/acct_shared',
  ]) {
    const chain = await request(path);
    assert.equal(chain.bootstrapped, 'true');
  }
  const chainCatalog = await request('/registry');
  assert.equal(chainCatalog.repos.length, 5);
  assert.deepEqual(chainCatalog.aggregates, [
    { aggregateName: 'lifecycle', aggregateId: 'acct_a' },
    { aggregateName: 'lifecycle', aggregateId: 'acct_shared' },
    { aggregateName: 'lifecycle', aggregateId: 'acct_z' },
    { aggregateName: 'secondary', aggregateId: 'acct_shared' },
  ]);
  const lifecycleMembership = await request('/catalog/lifecycle/acct_a');
  assert.equal(lifecycleMembership.aggregateIds.result._tag, 'Success');
  assert.deepEqual(lifecycleMembership.aggregateIds.result.success, [
    'acct_a',
    'acct_shared',
    'acct_z',
  ]);
  assert.equal(lifecycleMembership.exists.result.success, true);
  const listedAgentIds = await request('/agent-ids/lifecycle/1.0.0');
  assert.equal(listedAgentIds.result._tag, 'Success');
  assert.deepEqual(
    listedAgentIds.result.success,
    lifecycleMembership.aggregateIds.result.success,
  );
  const secondaryMembership = await request('/catalog/secondary/acct_shared');
  assert.deepEqual(secondaryMembership.aggregateIds.result.success, [
    'acct_shared',
  ]);
  assert.equal(secondaryMembership.exists.result.success, true);
  assert.equal(
    (await request('/catalog/lifecycle/acct_missing')).exists.result.success,
    false,
  );
  assert.equal(
    (await request('/catalog/secondary/acct_a')).exists.result.success,
    false,
  );
  const unknownAggregate = await request('/catalog/unknown/acct_a');
  assert.deepEqual(unknownAggregate.aggregateIds.result.success, []);
  assert.equal(unknownAggregate.exists.result.success, false);
  const repeated = await request('/register-chain/lifecycle/acct_a');
  assert.equal(repeated.result._tag, 'Success');
  assert.equal(
    (await request('/register-chain/lifecycle/acct_a')).result._tag,
    'Success',
  );
  assert.deepEqual(await request('/registry'), chainCatalog);
  await restart('fixed');
  assert.equal((await request('/chain/lifecycle/acct_a')).bootstrapped, 'true');
  assert.deepEqual(await request('/registry'), chainCatalog);
  assert.deepEqual(
    (await request('/catalog/lifecycle/acct_a')).aggregateIds.result.success,
    lifecycleMembership.aggregateIds.result.success,
  );
  console.log(
    'PASS: only AggregateChain registration records aggregates; filtered ID order and exact membership survive duplicate registration and restart',
  );

  assert.deepEqual(
    await request('/registry/fail-aggregate-write'),
    chainCatalog,
  );
  const failedRegistration = await request(
    '/register-chain/lifecycle/acct_rollback',
  );
  assert.equal(failedRegistration.result._tag, 'Failure');
  assert.match(
    JSON.stringify(failedRegistration.result.failure),
    /drizzle-transaction-failed/,
  );
  assert.deepEqual(
    await request('/registry'),
    chainCatalog,
    'failure of the aggregate insert must roll back the earlier Repo metadata write',
  );
  await request('/registry/allow-aggregate-write');
  assert.equal(
    (await request('/register-chain/lifecycle/acct_rollback')).result._tag,
    'Success',
  );
  const recoveredCatalog = await request('/registry');
  assert.equal(recoveredCatalog.repos.length, 6);
  assert.equal(recoveredCatalog.aggregates.length, 5);
  assert.equal(
    (await request('/catalog/lifecycle/acct_rollback')).exists.result.success,
    true,
  );
  console.log(
    'PASS: real SQLite rollback keeps Repo metadata and aggregate identity atomic when the second write fails; retry commits both',
  );
} finally {
  await worker?.dispose();
  await rm(directory, { recursive: true, force: true });
}
