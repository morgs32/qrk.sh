import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import type { Async } from '@zerospin/core/async/Async';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { cloudIdAbbreviations } from '@zerospin/core/utils/cloudIdAbbreviations';
import { makeSystemWorkerName } from '@zerospin/dispatch-worker/makeSystemWorkerName';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { loadConfig } from 'c12';
import { config as loadEnv } from 'dotenv';
import { Effect, Layer, Schema } from 'effect';

import { loadZerospinConfigFn } from '../deploy/loadZerospinConfigFn.js';

const require = createRequire(import.meta.url);

export const devFn = Effect.fn('devFn')(function* (props: {
  clean: boolean;
  port: number | undefined;
}): Effect.fn.Return<
  Readonly<{ port: number | undefined }>,
  IAnyError,
  Async
> {
  const { clean, port: portOption } = props;
  const cwd = process.cwd();

  // Match deploy and studio config loading: local overrides are loaded first,
  // and dotenv then leaves those existing values intact while loading .env.
  // This happens before zerospin.config is evaluated so the config may read
  // the same project environment in dev as it does in deploy and studio.
  yield* Effect.sync(() => {
    loadEnv({ path: path.join(cwd, '.env.local') });
    loadEnv({ path: path.join(cwd, '.env') });
  });

  // CLI --port wins; otherwise ZEROSPIN_PORT from .env.local / .env / process env.
  let port = portOption;
  if (port === undefined) {
    const raw = process.env['ZEROSPIN_PORT'];
    if (raw !== undefined && raw !== '') {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
        return yield* new ZerospinError({
          code: 'zerospin-dev-invalid-port',
          message: `Invalid ZEROSPIN_PORT "${raw}". Expected an integer from 1 to 65535.`,
        });
      }
      port = parsed;
    }
  }

  // 1. Resolve all inputs before touching this version's persisted state.
  //    In particular, a missing local Wrangler installation must not turn a
  //    requested clean into a state deletion followed by no dev server.
  const wranglerBinPath = yield* Effect.try({
    try: () =>
      require.resolve('wrangler/bin/wrangler.js', {
        paths: [cwd],
      }),
    catch: cause =>
      new ZerospinError({
        code: 'zerospin-dev-wrangler-not-found',
        message:
          'Could not resolve Wrangler from the current project. Install wrangler in the project before running zerospin dev.',
        cause: ZerospinError.prettyUnknownFailure(cause),
      }),
  });

  const zerospinConfig = yield* loadZerospinConfigFn(cwd).pipe(
    Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
  );

  const wranglerConfigResult = yield* Effect.tryPromise({
    try: () =>
      loadConfig<Record<string, unknown>>({
        cwd,
        name: 'wrangler',
        configFile: 'wrangler.jsonc',
        configFileRequired: true,
        dotenv: false,
        envName: false,
        rcFile: false,
        packageJson: false,
        giget: false,
        extend: false,
        // This load has exactly one source. Returning the first present source
        // prevents defu from dropping explicit nulls in the user's JSONC.
        merger: (highestPriority, main) => highestPriority ?? main ?? {},
      }),
    catch: cause =>
      new ZerospinError({
        code: 'zerospin-dev-wrangler-config-load-failed',
        message: 'Failed to load wrangler.jsonc for zerospin dev.',
        cause: ZerospinError.prettyUnknownFailure(cause),
      }),
  });
  const wranglerConfig = wranglerConfigResult.config;

  const rawVars = wranglerConfig['vars'];
  if (
    rawVars === null ||
    typeof rawVars !== 'object' ||
    Array.isArray(rawVars)
  ) {
    return yield* new ZerospinError({
      code: 'zerospin-dev-system-id-missing',
      message: 'wrangler.jsonc vars must contain ZEROSPIN_SYSTEM_ID.',
    });
  }
  const rawSystemId = Reflect.get(rawVars, 'ZEROSPIN_SYSTEM_ID');
  const systemId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(cloudIdAbbreviations.systemRecord),
  )(rawSystemId).pipe(
    Effect.mapError(
      cause =>
        new ZerospinError({
          code: 'zerospin-dev-system-id-missing',
          message:
            'wrangler.jsonc vars.ZEROSPIN_SYSTEM_ID must be a sys_-prefixed id.',
          cause: cause.message,
        }),
    ),
  );
  const systemWorkerName = makeSystemWorkerName({
    systemId,
    instanceId: 'local',
  });
  const cleanRequestId = clean ? `cln_${randomUUID()}` : undefined;
  const generatedVars = { ...rawVars };
  Reflect.deleteProperty(generatedVars, 'DEV');
  Reflect.deleteProperty(generatedVars, 'ZEROSPIN_CLEAN_REQUEST_ID');
  Reflect.deleteProperty(generatedVars, 'ZEROSPIN_DEPLOY_ID');
  Reflect.deleteProperty(generatedVars, 'ZEROSPIN_GENERATION_ID');
  Reflect.deleteProperty(generatedVars, 'ZEROSPIN_INSTANCE_ID');
  Reflect.deleteProperty(generatedVars, 'ZEROSPIN_SYSTEM_RELEASE');
  Reflect.set(generatedVars, 'ZEROSPIN_SYSTEM_ID', systemId);

  const dispatchWorkerPath = yield* Effect.try({
    // Resolve from @zerospin/cli itself. Projects do not need to expose the
    // CLI's dispatch-worker dependency as their own direct dependency.
    try: () => require.resolve('@zerospin/dispatch-worker/Worker'),
    catch: cause =>
      new ZerospinError({
        code: 'zerospin-dev-dispatch-worker-not-found',
        message:
          'Could not resolve the shared Zerospin dispatch Worker for zerospin dev.',
        cause: ZerospinError.prettyUnknownFailure(cause),
      }),
  });

  const seedModulePath = yield* Effect.try({
    try: () => {
      if (zerospinConfig.seeds !== null) {
        return require.resolve(path.resolve(cwd, zerospinConfig.seeds));
      }

      // The empty module is deliberately not a package export. It is a
      // build-time alias target that ships beside the resolved Worker entry.
      return require.resolve(
        path.join(path.dirname(dispatchWorkerPath), 'emptySeeds.js'),
      );
    },
    catch: cause =>
      new ZerospinError({
        code: 'zerospin-dev-seeds-not-found',
        message:
          zerospinConfig.seeds === null
            ? 'Could not resolve the built-in empty dev seed module.'
            : `Could not resolve the configured dev seed module ${zerospinConfig.seeds}.`,
        cause: ZerospinError.prettyUnknownFailure(cause),
      }),
  });

  // 2. Preserve the project config field-for-field, then replace only the
  //    fields owned by zerospin dev.
  const rawAlias = wranglerConfig['alias'];
  if (
    rawAlias !== undefined &&
    rawAlias !== null &&
    (typeof rawAlias !== 'object' || Array.isArray(rawAlias))
  ) {
    return yield* new ZerospinError({
      code: 'zerospin-dev-wrangler-config-invalid',
      message: 'wrangler.jsonc alias must be an object when present.',
    });
  }

  const rawCompatibilityFlags = wranglerConfig['compatibility_flags'];
  if (
    rawCompatibilityFlags !== undefined &&
    rawCompatibilityFlags !== null &&
    (!Array.isArray(rawCompatibilityFlags) ||
      rawCompatibilityFlags.some(flag => typeof flag !== 'string'))
  ) {
    return yield* new ZerospinError({
      code: 'zerospin-dev-wrangler-config-invalid',
      message:
        'wrangler.jsonc compatibility_flags must be an array of strings when present.',
    });
  }
  const compatibilityFlags = rawCompatibilityFlags ?? [];
  if (compatibilityFlags.includes('disable_ctx_exports')) {
    return yield* new ZerospinError({
      code: 'zerospin-dev-wrangler-config-invalid',
      message:
        'wrangler.jsonc cannot disable ctx.exports because zerospin dev uses it for DevZerospinApis.',
    });
  }
  const compatibilityFlagsWithoutCtxExports = compatibilityFlags.filter(
    flag => flag !== 'enable_ctx_exports',
  );
  const rawCompatibilityDate = wranglerConfig['compatibility_date'];

  const rawMigrations = wranglerConfig['migrations'];
  if (
    rawMigrations !== undefined &&
    rawMigrations !== null &&
    !Array.isArray(rawMigrations)
  ) {
    return yield* new ZerospinError({
      code: 'zerospin-dev-wrangler-config-invalid',
      message: 'wrangler.jsonc migrations must be an array when present.',
    });
  }
  const migrations = rawMigrations ?? [];
  if (
    migrations.some(
      migration =>
        migration !== null &&
        typeof migration === 'object' &&
        Reflect.get(migration, 'tag') === 'zerospin-dev-v1',
    )
  ) {
    return yield* new ZerospinError({
      code: 'zerospin-dev-migration-conflict',
      message:
        'wrangler.jsonc already contains migration tag zerospin-dev-v1. That tag is reserved for zerospin dev.',
    });
  }

  const generatedConfig = {
    ...wranglerConfig,
    main: dispatchWorkerPath,
    alias: {
      ...rawAlias,
      seeds: seedModulePath,
    },
    // Workerd rejects an explicit enable_ctx_exports flag once the feature is
    // default-on. Older compatibility dates still need the opt-in. Removing
    // any supplied copies on newer/default dates preserves the same enabled
    // runtime behavior without producing an invalid generated config.
    compatibility_flags:
      typeof rawCompatibilityDate === 'string' &&
      rawCompatibilityDate < '2025-11-17'
        ? [...compatibilityFlagsWithoutCtxExports, 'enable_ctx_exports']
        : compatibilityFlagsWithoutCtxExports,
    migrations: [
      ...migrations,
      {
        tag: 'zerospin-dev-v1',
        new_sqlite_classes: ['DevZerospinApis'],
      },
    ],
    vars: generatedVars,
    version_metadata: {
      binding: 'ZEROSPIN_VERSION_METADATA',
    },
  };

  const generatedConfigName = `wrangler.zerospin-dev.${process.pid}.local.json`;
  const generatedConfigPath = path.join(cwd, generatedConfigName);
  const persistenceRoot = path.join(
    cwd,
    '.wrangler',
    'zerospin',
    'dev',
    encodeURIComponent(systemWorkerName),
  );

  const wranglerArgs = [
    wranglerBinPath,
    'dev',
    '-c',
    `./${generatedConfigName}`,
    '--ip',
    '0.0.0.0',
  ];
  if (port !== undefined) {
    wranglerArgs.push('--port', String(port));
  }
  wranglerArgs.push(
    '--persist-to',
    persistenceRoot,
    '--var',
    'DEV:true',
    '--var',
    'ZEROSPIN_INSTANCE_ID:local',
  );
  if (cleanRequestId !== undefined) {
    wranglerArgs.push('--var', `ZEROSPIN_CLEAN_REQUEST_ID:${cleanRequestId}`);
  }

  // The normal Effect finalizer owns cleanup while the CLI is alive. Nx, Ink,
  // or another parent can still call process.exit while propagating a signal,
  // which does not wait for Promise finalizers. Signal/exit callbacks therefore
  // remove this generated file synchronously before forwarding termination.
  const removeGeneratedConfigOnProcessExit = () => {
    try {
      rmSync(generatedConfigPath, { force: true });
    } catch {
      // The process is already exiting, so there is no asynchronous error
      // channel left. Ordinary cleanup failures still use the Effect below.
    }
  };

  const removeGeneratedConfig = Effect.tryPromise({
    try: () => fs.rm(generatedConfigPath, { force: true }),
    catch: cause =>
      new ZerospinError({
        code: 'zerospin-dev-generated-config-remove-failed',
        message: `Failed to remove generated Wrangler config ${generatedConfigName}.`,
        cause: ZerospinError.prettyUnknownFailure(cause),
      }),
  }).pipe(
    Effect.tap(() =>
      Effect.sync(() => {
        process.removeListener('exit', removeGeneratedConfigOnProcessExit);
      }),
    ),
  );

  const exitCode = yield* Effect.gen(function* () {
    process.once('exit', removeGeneratedConfigOnProcessExit);

    // Write the complete launch input before starting Wrangler. Clean is an
    // explicit detached-generation request consumed by DevZerospinApis; the
    // CLI never deletes the stable instance persistence root.
    yield* Effect.tryPromise({
      try: () =>
        fs.writeFile(
          generatedConfigPath,
          `${JSON.stringify(generatedConfig, null, 2)}\n`,
          'utf8',
        ),
      catch: cause =>
        new ZerospinError({
          code: 'zerospin-dev-generated-config-write-failed',
          message: `Failed to write generated Wrangler config ${generatedConfigName}.`,
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });

    return yield* Effect.async<number, ZerospinError<string>>(
      (resume, abortSignal) => {
        try {
          const child = spawn(process.execPath, wranglerArgs, {
            cwd,
            env: process.env,
            stdio: ['inherit', 'pipe', 'inherit'],
          });
          let settled = false;
          let checkingReadiness = false;
          let wranglerOutput = '';

          const removeListeners = () => {
            process.removeListener('SIGINT', onSigint);
            process.removeListener('SIGTERM', onSigterm);
            process.removeListener('SIGHUP', onSighup);
            abortSignal.removeEventListener('abort', onAbort);
          };
          const onSigint = () => {
            removeGeneratedConfigOnProcessExit();
            child.kill('SIGINT');
          };
          const onSigterm = () => {
            removeGeneratedConfigOnProcessExit();
            child.kill('SIGTERM');
          };
          const onSighup = () => {
            removeGeneratedConfigOnProcessExit();
            child.kill('SIGTERM');
          };
          const onAbort = () => {
            removeGeneratedConfigOnProcessExit();
            child.kill('SIGTERM');
          };

          process.once('SIGINT', onSigint);
          process.once('SIGTERM', onSigterm);
          process.once('SIGHUP', onSighup);
          abortSignal.addEventListener('abort', onAbort, { once: true });

          child.stdout?.on('data', chunk => {
            const text = String(chunk);
            process.stdout.write(text);
            wranglerOutput = `${wranglerOutput}${text}`.slice(-16_384);

            const readyMatch = wranglerOutput.match(
              /Ready on (http:\/\/[^/\s]+:\d+)/,
            );
            if (
              readyMatch?.[1] === undefined ||
              checkingReadiness ||
              settled
            ) {
              return;
            }

            checkingReadiness = true;
            const readyUrl = readyMatch[1];
            wranglerOutput = '';
            void fetch(`${readyUrl}/__zerospin/ready`)
              .then(async response => {
                if (response.ok || settled) {
                  checkingReadiness = false;
                  return;
                }

                const failure = await response.text();
                if (settled) return;
                settled = true;
                removeListeners();
                child.kill('SIGTERM');
                resume(
                  Effect.fail(
                    new ZerospinError({
                      code: 'zerospin-dev-worker-not-ready',
                      message:
                        'The local Zerospin Worker rejected this code version.',
                      cause: failure,
                    }),
                  ),
                );
              })
              .catch(cause => {
                if (settled) return;
                settled = true;
                removeListeners();
                child.kill('SIGTERM');
                resume(
                  Effect.fail(
                    new ZerospinError({
                      code: 'zerospin-dev-readiness-check-failed',
                      message:
                        'Failed to check whether the local Zerospin Worker is ready.',
                      cause: ZerospinError.prettyUnknownFailure(cause),
                    }),
                  ),
                );
              });
          });

          child.once('error', cause => {
            if (settled) return;
            settled = true;
            removeListeners();
            resume(
              Effect.fail(
                new ZerospinError({
                  code: 'zerospin-dev-wrangler-start-failed',
                  message: 'Failed to start Wrangler for zerospin dev.',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
              ),
            );
          });

          child.once('close', (code, signal) => {
            if (settled) return;
            settled = true;
            removeListeners();
            if (signal !== null) {
              resume(
                Effect.fail(
                  new ZerospinError({
                    code: 'zerospin-dev-wrangler-signaled',
                    message: `Wrangler exited from signal ${signal}.`,
                  }),
                ),
              );
              return;
            }
            resume(Effect.succeed(code ?? 1));
          });

          return Effect.async<void>(resumeShutdown => {
            removeListeners();

            if (settled) {
              resumeShutdown(Effect.void);
              return;
            }

            // The abort listener has already removed the generated config and
            // asked Wrangler to terminate. Keep the interruption finalizer open
            // until the child actually closes so no Wrangler process is orphaned.
            const onShutdownClose = () => {
              resumeShutdown(Effect.void);
            };
            child.once('close', onShutdownClose);

            if (!child.killed) {
              child.kill('SIGTERM');
            }

            return Effect.sync(() => {
              child.removeListener('close', onShutdownClose);
            });
          });
        } catch (cause) {
          resume(
            Effect.fail(
              new ZerospinError({
                code: 'zerospin-dev-wrangler-start-failed',
                message: 'Failed to start Wrangler for zerospin dev.',
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
            ),
          );
          return;
        }
      },
    );
  }).pipe(
    Effect.matchEffect({
      onFailure: error =>
        removeGeneratedConfig.pipe(Effect.andThen(Effect.fail(error))),
      onSuccess: code => removeGeneratedConfig.pipe(Effect.as(code)),
    }),
    Effect.onInterrupt(() => removeGeneratedConfig.pipe(Effect.orDie)),
  );

  if (exitCode !== 0) {
    return yield* new ZerospinError({
      code: 'zerospin-dev-wrangler-exited',
      message: `Wrangler exited with code ${exitCode}.`,
    });
  }

  return {
    port,
  };
});
