import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);

it('checks real Wrangler initial/reloaded bundles and exits nonzero with all listeners closed on a spec conflict', async () => {
  const directory = await mkdtemp(
    join(new URL('../../test/', import.meta.url).pathname, '.dev-reload-'),
  );
  const shoppingRoot = new URL(
    '../../../../examples/shopping/',
    import.meta.url,
  ).pathname;
  const configSource = (
    await readFile(
      new URL('../../test/config/zerospin.config.ts', import.meta.url),
      'utf8',
    )
  ).replace('sys_typed_config_fixture', 'sys_dev_reload_fixture');
  const configPath = join(directory, 'zerospin.config.ts');
  await mkdir(join(directory, 'node_modules'), { recursive: true });
  await symlink(
    dirname(
      require.resolve('wrangler/package.json', { paths: [shoppingRoot] }),
    ),
    join(directory, 'node_modules/wrangler'),
  );
  await writeFile(configPath, configSource);
  await writeFile(
    join(directory, 'runner.mjs'),
    `
import { createJiti } from 'jiti';
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import * as NodeTerminal from '@effect/platform-node-shared/NodeTerminal';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect, Layer } from 'effect';
const { devFn } = await createJiti(import.meta.url).import(${JSON.stringify(new URL('./devFn.ts', import.meta.url).pathname)});
await Effect.runPromise(devFn({ clean: false, port: 0 }).pipe(
  Effect.provide(Layer.mergeAll(AsyncLive, NodeFileSystem.layer, NodePath.layer, NodeTerminal.layer)),
  Effect.catch(error => Effect.sync(() => { console.error(error); process.exitCode = 1; })),
));
`,
  );
  const child = spawn(process.execPath, ['runner.mjs'], {
    cwd: directory,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit');
  let output = '';
  child.stdout.on('data', data => {
    output += String(data);
  });
  child.stderr.on('data', data => {
    output += String(data);
  });
  try {
    await expect
      .poll(
        () => {
          if (child.exitCode !== null) throw new Error(output);
          return output.match(/Ready on (http:\/\/127\.0\.0\.1:\d+)\//)?.[1];
        },
        { timeout: 60_000, interval: 100 },
      )
      .toBeTruthy();
    const apiUrl = output.match(/Ready on (http:\/\/127\.0\.0\.1:\d+)\//)?.[1];
    expect(apiUrl).toBeDefined();
    expect(output.match(/system spec accepted/g)).toHaveLength(1);

    await writeFile(
      configPath,
      configSource.replace(
        'Effect.succeed(signature)',
        'Effect.succeed(signature.toString())',
      ),
    );
    await expect
      .poll(() => output.match(/system spec accepted/g)?.length, {
        timeout: 30_000,
        interval: 100,
      })
      .toBe(2);

    await writeFile(
      configPath,
      configSource.replace(
        'payload: { name: primitives.text() }',
        'payload: { name: primitives.text(), extra: primitives.text() }',
      ),
    );
    await expect
      .poll(() => child.exitCode, { timeout: 30_000, interval: 100 })
      .toBe(1);
    await exited;
    expect(output).toContain('aggregate-spec-mismatch');
    expect(
      (await readdir(join(directory, '.wrangler/zerospin'))).filter(file =>
        file.startsWith('entry-'),
      ),
    ).toEqual([]);
    await expect(fetch(apiUrl ?? '')).rejects.toThrow();
    const persistedFiles = await readdir(
      join(directory, '.wrangler/zerospin/dev-worker/sys_dev_reload_fixture'),
      { recursive: true },
    );
    const databases = persistedFiles.filter(file => file.endsWith('.sqlite'));
    let systemDatabases = 0;
    for (const file of databases) {
      const database = new DatabaseSync(
        join(
          directory,
          '.wrangler/zerospin/dev-worker/sys_dev_reload_fixture',
          file,
        ),
        { readOnly: true },
      );
      try {
        if (
          database
            .prepare(
              "SELECT name FROM sqlite_master WHERE name = 'aggregateSpecLocks'",
            )
            .all().length === 0
        ) {
          continue;
        }
        systemDatabases++;
        expect(
          database
            .prepare('SELECT name, version FROM aggregateSpecLocks')
            .all(),
        ).toEqual([{ name: 'user', version: '2.0.0' }]);
        expect(
          database.prepare('SELECT name, version FROM serviceSpecLocks').all(),
        ).toEqual([{ name: 'app', version: '2.0.0' }]);
        expect(database.prepare('SELECT * FROM repos').all()).toEqual([]);
      } finally {
        database.close();
      }
    }
    expect(systemDatabases).toBe(1);

    // Retained locks reject the conflicting initial bundle. Restoring the
    // authored spec also proves a real SIGTERM closes Wrangler and its files.
    for (const restart of [
      { source: await readFile(configPath, 'utf8'), rejected: true },
      { source: configSource, rejected: false },
    ]) {
      await writeFile(configPath, restart.source);
      const restarted = spawn(process.execPath, ['runner.mjs'], {
        cwd: directory,
        env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const restartExited = once(restarted, 'exit');
      let restartOutput = '';
      restarted.stdout.on('data', data => {
        restartOutput += String(data);
      });
      restarted.stderr.on('data', data => {
        restartOutput += String(data);
      });
      try {
        if (!restart.rejected) {
          await expect
            .poll(() => restartOutput, { timeout: 30_000, interval: 100 })
            .toContain('system spec accepted');
          restarted.kill('SIGTERM');
        }
        await expect
          .poll(() => restarted.exitCode, { timeout: 30_000, interval: 100 })
          .toBe(restart.rejected ? 1 : 0);
        await restartExited;
        if (restart.rejected) {
          expect(restartOutput).toContain('aggregate-spec-mismatch');
          expect(restartOutput).not.toContain('system spec accepted');
        } else {
          const restartedUrl = restartOutput.match(
            /Ready on (http:\/\/127\.0\.0\.1:\d+)\//,
          )?.[1];
          expect(restartedUrl).toBeDefined();
          await expect(fetch(restartedUrl ?? '')).rejects.toThrow();
        }
        expect(
          (await readdir(join(directory, '.wrangler/zerospin'))).filter(file =>
            file.startsWith('entry-'),
          ),
        ).toEqual([]);
      } catch (error) {
        throw new Error(restartOutput, { cause: error });
      } finally {
        if (restarted.exitCode === null) {
          restarted.kill('SIGKILL');
          await restartExited;
        }
      }
    }
  } catch (error) {
    throw new Error(output, { cause: error });
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  }
}, 130_000);
