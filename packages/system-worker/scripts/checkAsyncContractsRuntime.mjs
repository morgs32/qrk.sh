import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = await mkdtemp(join(tmpdir(), 'zerospin-async-runtime-'));
console.log(`Disposable storage and readiness logs: ${root}`);
const port = () =>
  new Promise((done, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        assert.ok(address && typeof address !== 'string');
        done(address.port);
      });
    });
  });
async function poll(read, predicate, description, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await read();
      if (predicate(last)) return last;
    } catch (error) {
      last = String(error);
    }
    await delay(100);
  }
  throw new Error(`Timed out: ${description}; last=${JSON.stringify(last)}`);
}
async function boot(stage, dir, phase) {
  const listen = await port(),
    inspector = await port();
  const config = join(dir, 'wrangler.json');
  await writeFile(
    config,
    JSON.stringify(
      {
        name: 'async-contracts-runtime',
        main: resolve('src/fixtures/asyncContractsRuntime.ts'),
        compatibility_date: '2026-09-01',
        compatibility_flags: ['nodejs_compat'],
        alias: { config: resolve('src/fixtures/asyncRuntimeConfig.ts') },
        vars: { PAUSE_AT: stage },
        durable_objects: {
          bindings: [
            { name: 'OWNER', class_name: 'AsyncOwner' },
            { name: 'CHAIN', class_name: 'AsyncChain' },
            { name: 'PROVIDER', class_name: 'AsyncProvider' },
          ],
        },
        migrations: [
          {
            tag: 'v1',
            new_sqlite_classes: ['AsyncOwner', 'AsyncChain', 'AsyncProvider'],
          },
        ],
      },
      null,
      2,
    ),
  );
  const child = spawn(
    'pnpm',
    [
      'exec',
      'wrangler',
      'dev',
      '--config',
      config,
      '--persist-to',
      join(dir, 'storage'),
      '--port',
      String(listen),
      '--inspector-port',
      String(inspector),
    ],
    {
      detached: true,
      env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', chunk => {
    output += chunk;
  });
  child.stderr.on('data', chunk => {
    output += chunk;
  });
  const stop = async () => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    await new Promise(done => {
      if (child.exitCode !== null || child.signalCode !== null) done();
      else child.once('exit', done);
    });
    await writeFile(join(dir, `${phase}.log`), output);
  };
  try {
    await poll(
      async () => output,
      text => /Ready on http:\/\//.test(text),
      `${stage}: Wrangler readiness`,
    );
    const read = async path => {
      const response = await fetch(`http://127.0.0.1:${listen}${path}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    };
    await poll(
      () => read('/ready'),
      state => state.ready,
      `${stage}: fixture activation`,
    );
    console.log(
      `READY ${stage}/${phase}: ${output.match(/Ready on http:\/\/[^\s]+/)?.[0]}`,
    );
    return { read, stop };
  } catch (error) {
    await stop();
    throw new Error(`${error}\n${output.slice(-6000)}`);
  }
}
for (const stage of ['source', 'provider', 'record', 'admission']) {
  const dir = await mkdtemp(join(root, `${stage}-`));
  let server = await boot(stage, dir, 'before');
  try {
    await server.read('/start');
    const before = await poll(
      () => server.read('/status'),
      state => {
        if (stage === 'source') {
          return (
            state.work.length === 1 && state.work[0].externalRecordedAt === null
          );
        }
        if (stage === 'provider') {
          return (
            state.provider[0]?.calls >= 1 &&
            state.work[0]?.externalRecordedAt === null
          );
        }
        if (stage === 'record') {
          return state.outbox.length === 1 && state.chain.length === 1;
        }
        return state.outbox.length === 1 && state.chain.length === 2;
      },
      `${stage}: crash boundary`,
    );
    const commandId = before.work[0].asyncCommandId;
    await server.stop();
    server = await boot('normal', dir, 'after');
    const after = await poll(
      () => server.read('/status'),
      state =>
        state.outbox.length === 0 &&
        state.commands.length === 2 &&
        state.commands[1].execution.status === 'succeeded',
      `${stage}: recovered application`,
    );
    assert.equal(after.work.length, 1);
    assert.equal(after.work[0].asyncCommandId, commandId);
    assert.equal(after.chain.length, 2);
    assert.equal(after.chain[1].id, commandId);
    assert.equal(after.chain[1].aggregateIndex, 2);
    assert.equal(after.commands[1].execution.result, 'receipt:restart');
    assert.equal(
      after.provider.length,
      1,
      'one provider effect per immutable intent',
    );
    if (stage === 'record' || stage === 'admission') {
      assert.equal(
        after.provider[0].calls,
        before.provider[0].calls,
        'recorded evidence never repeats production',
      );
    }
    if (stage === 'provider') {
      assert.ok(
        after.provider[0].calls > before.provider[0].calls,
        'uncaptured provider effect is reconciled on recovery',
      );
    }
    console.log(
      `PASS restart ${stage}: source=1 child=${commandId} chainIndex=2 providerCalls=${after.provider[0].calls} outbox=0 result=receipt:restart`,
    );
  } finally {
    await server.stop();
  }
}
