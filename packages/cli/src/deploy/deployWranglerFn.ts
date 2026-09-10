import { randomBytes, randomUUID } from 'node:crypto';
import type { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import type { Async } from '@zerospin/core/async/Async';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { loadConfig } from 'c12';
import { config as loadEnv } from 'dotenv';
import { Effect, Fiber, Layer, Schema, Stream, type Scope } from 'effect';
import {
  ChildProcess,
  type ChildProcessSpawner,
} from 'effect/unstable/process';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

import { loadZerospinConfigFn } from './loadZerospinConfigFn.js';
import { makeSystemEntry } from './makeSystemEntry.js';

const require = createRequire(import.meta.url);

/**
 * Deploy the current project directly to the operator's Cloudflare account.
 *
 * This path deliberately has no hosted Zerospin URL or API client. Wrangler is
 * the only deployment boundary, and all credentials belong to this project.
 */
export const deployWranglerFn = Effect.fn('deployWranglerFn')(
  function* (): Effect.fn.Return<
    | Readonly<{
        status: 'keys-generated';
        envFilePath: string;
        zerospinPublishableKey: string;
        zerospinSecretKey: string;
      }>
    | Readonly<{
        status: 'deployed';
        workerName: string;
        versionId: string;
        zerospinPublishableKey: string;
      }>,
    IAnyError,
    Async | ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
  > {
    const cwd = process.cwd();
    const deploymentFiber = yield* Effect.fiber;
    const interruptDeployment = () => {
      process.exitCode = 1;
      Effect.runFork(Fiber.interrupt(deploymentFiber));
    };
    // Miniflare's immediate-exit hooks would bypass asynchronous rollback.
    // Keep its ordinary exit hook and other listeners; own only these signals.
    const ownWranglerSignals = (
      signal: string | symbol,
      listener: (...args: unknown[]) => void,
    ) => {
      if (
        !(
          (signal === 'SIGINT' && listener.name === 'onSignalInt') ||
          (signal === 'SIGTERM' && listener.name === 'onSignalTerm') ||
          (signal === 'SIGHUP' && listener.name === 'onSignalHup')
        )
      ) {
        return;
      }
      const source = listener.toString();
      if (
        source.includes('runCallbacks();') &&
        source.includes('process.exit(128 +')
      ) {
        globalThis.queueMicrotask(() => process.off(signal, listener));
      }
    };
    process.on('SIGINT', interruptDeployment);
    process.on('SIGTERM', interruptDeployment);
    process.on('SIGHUP', interruptDeployment);
    process.on('newListener', ownWranglerSignals);
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        process.off('SIGINT', interruptDeployment);
        process.off('SIGTERM', interruptDeployment);
        process.off('SIGHUP', interruptDeployment);
        process.off('newListener', ownWranglerSignals);
      }),
    );

    // Local overrides win because dotenv does not replace existing values by
    // default. Nothing in this branch reads ZEROSPIN_API_URL or a hosted token.
    yield* Effect.sync(() => {
      loadEnv({ path: path.join(cwd, '.env.local') });
      loadEnv({ path: path.join(cwd, '.env') });
    });

    const configuredPublishableKey = process.env['ZEROSPIN_PUBLISHABLE_KEY'];
    const configuredSecretKey = process.env['ZEROSPIN_SECRET_KEY'];
    if (!configuredPublishableKey || !configuredSecretKey) {
      return {
        status: 'keys-generated',
        envFilePath: path.join(cwd, '.env.local'),
        zerospinPublishableKey: `pk_live_${randomBytes(32).toString('base64url')}`,
        zerospinSecretKey: `sk_live_${randomBytes(32).toString('base64url')}`,
      };
    }

    const wranglerBinPath = yield* Effect.try({
      try: () => {
        const wranglerPackageJsonPath = require.resolve(
          'wrangler/package.json',
          { paths: [cwd] },
        );
        return path.join(
          path.dirname(wranglerPackageJsonPath),
          'bin',
          'wrangler.js',
        );
      },
      catch: cause =>
        new ZerospinError({
          code: 'zerospin-wrangler-not-found',
          message:
            'Could not resolve Wrangler from the current project. Install wrangler in the project before running zerospin deploy.',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });

    yield* loadZerospinConfigFn(cwd).pipe(
      Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
    );
    const systemEntry = yield* makeSystemEntry(cwd).pipe(
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
          merger: (highestPriority, main) => highestPriority ?? main ?? {},
        }),
      catch: cause =>
        new ZerospinError({
          code: 'zerospin-wrangler-config-load-failed',
          message: 'Failed to load wrangler.jsonc for production deployment.',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });
    const wranglerConfig = wranglerConfigResult.config;

    const workerName = wranglerConfig['name'];
    if (
      typeof workerName !== 'string' ||
      !/^[a-z][a-z0-9_-]*$/.test(workerName)
    ) {
      return yield* new ZerospinError({
        code: 'zerospin-wrangler-config-invalid',
        message:
          'wrangler.jsonc name must be a lowercase Worker name suitable for a version override.',
      });
    }

    const rawVars = wranglerConfig['vars'];
    if (
      rawVars === null ||
      typeof rawVars !== 'object' ||
      Array.isArray(rawVars)
    ) {
      return yield* new ZerospinError({
        code: 'zerospin-wrangler-system-id-missing',
        message: 'wrangler.jsonc vars must contain ZEROSPIN_SYSTEM_ID.',
      });
    }
    const systemId = yield* Schema.decodeUnknownEffect(
      makeAbbreviationIdSchema(coreAbbreviations.system),
    )(Reflect.get(rawVars, 'ZEROSPIN_SYSTEM_ID')).pipe(
      Effect.mapError(
        cause =>
          new ZerospinError({
            code: 'zerospin-wrangler-system-id-missing',
            message:
              'wrangler.jsonc vars.ZEROSPIN_SYSTEM_ID must be a sys_-prefixed id.',
            cause: cause.message,
          }),
      ),
    );

    const productionWorkerPath = yield* Effect.try({
      try: () =>
        require.resolve('@zerospin/production-worker/ProductionWorker'),
      catch: cause =>
        new ZerospinError({
          code: 'zerospin-wrangler-production-worker-not-found',
          message:
            'Could not resolve the Zerospin Production Worker for production deployment.',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });
    const rawAlias = wranglerConfig['alias'];
    if (
      rawAlias !== undefined &&
      rawAlias !== null &&
      (typeof rawAlias !== 'object' || Array.isArray(rawAlias))
    ) {
      return yield* new ZerospinError({
        code: 'zerospin-wrangler-config-invalid',
        message: 'wrangler.jsonc alias must be an object when present.',
      });
    }
    const rawExports = wranglerConfig['exports'];
    if (
      rawExports === null ||
      typeof rawExports !== 'object' ||
      Array.isArray(rawExports)
    ) {
      return yield* new ZerospinError({
        code: 'zerospin-wrangler-config-invalid',
        message: 'wrangler.jsonc exports must declare the Durable Objects.',
      });
    }
    const systemRepoExport = Reflect.get(rawExports, 'SystemRepo');
    if (
      systemRepoExport === null ||
      typeof systemRepoExport !== 'object' ||
      Array.isArray(systemRepoExport) ||
      Reflect.get(systemRepoExport, 'type') !== 'durable-object' ||
      Reflect.get(systemRepoExport, 'storage') !== 'sqlite'
    ) {
      return yield* new ZerospinError({
        code: 'zerospin-wrangler-config-invalid',
        message:
          'wrangler.jsonc exports.SystemRepo must be a live SQLite Durable Object.',
      });
    }
    const generatedVars = { ...rawVars };
    Reflect.deleteProperty(generatedVars, 'CLERK_JWT_KEY');
    Reflect.deleteProperty(generatedVars, 'ZEROSPIN_API_URL');
    Reflect.set(generatedVars, 'ZEROSPIN_SYSTEM_ID', systemId);
    Reflect.set(generatedVars, 'ZEROSPIN_ENVIRONMENT', 'production');

    const generatedAlias = { ...rawAlias };
    Reflect.set(generatedAlias, 'system', systemEntry);

    const generatedConfig = {
      ...wranglerConfig,
      main: productionWorkerPath,
      version_metadata: { binding: 'ZEROSPIN_VERSION_METADATA' },
      alias: generatedAlias,
      vars: generatedVars,
    };

    const tempDirectory = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => fs.mkdtemp(path.join(os.tmpdir(), 'zerospin-wrangler-')),
        catch: cause =>
          new ZerospinError({
            code: 'zerospin-wrangler-temp-directory-failed',
            message: 'Failed to create temporary production deployment files.',
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
      }),
      directory =>
        Effect.tryPromise({
          try: () => fs.rm(directory, { recursive: true, force: true }),
          catch: cause =>
            new ZerospinError({
              code: 'zerospin-wrangler-temp-directory-remove-failed',
              message:
                'Failed to remove temporary production deployment files.',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
        }).pipe(
          Effect.catch(error =>
            Effect.sync(() => {
              process.stderr.write(
                `Deployment cleanup failed: ${error.message}\n`,
              );
            }),
          ),
        ),
    );
    const generatedConfigPath = path.join(tempDirectory, 'wrangler.json');
    const secretsPath = path.join(tempDirectory, 'secrets.json');

    const deployment = Effect.scoped(
      Effect.gen(function* () {
        yield* Effect.tryPromise({
          try: () =>
            Promise.all([
              fs.writeFile(
                generatedConfigPath,
                `${JSON.stringify(generatedConfig, null, 2)}\n`,
                { encoding: 'utf8', mode: 0o600 },
              ),
              fs.writeFile(
                secretsPath,
                `${JSON.stringify({
                  ZEROSPIN_PUBLISHABLE_KEY: configuredPublishableKey,
                  ZEROSPIN_SECRET_KEY: configuredSecretKey,
                })}\n`,
                { encoding: 'utf8', mode: 0o600 },
              ),
            ]),
          catch: cause =>
            new ZerospinError({
              code: 'zerospin-wrangler-temp-files-write-failed',
              message: 'Failed to write temporary production deployment files.',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
        });

        // Wrangler owns Cloudflare authentication. Project application secrets
        // reach the upload only through the mode-0600 secrets file.
        const wranglerEnvironment = { ...process.env };
        for (const key of [
          'ZEROSPIN_API_URL',
          'ZEROSPIN_PUBLISHABLE_KEY',
          'ZEROSPIN_SECRET_KEY',
          'CLERK_JWT_KEY',
        ]) {
          Reflect.deleteProperty(wranglerEnvironment, key);
        }
        const runWrangler = Effect.fn('deployWranglerFn.runWrangler')(
          function* (args: string[]) {
            const outputPath = path.join(
              tempDirectory,
              `${randomUUID()}.jsonl`,
            );
            const child = yield* ChildProcess.make(
              process.execPath,
              [wranglerBinPath, ...args, '--config', generatedConfigPath],
              {
                cwd,
                env: {
                  ...wranglerEnvironment,
                  WRANGLER_OUTPUT_FILE_PATH: outputPath,
                },
                stdin: 'inherit',
                stdout: 'pipe',
                stderr: 'pipe',
              },
            );
            let stdout = '';
            let stderr = '';
            const [exitCode] = yield* Effect.all(
              [
                child.exitCode,
                child.stdout.pipe(
                  Stream.decodeText(),
                  Stream.runForEach(text =>
                    Effect.sync(() => {
                      stdout += text;
                      if (!args.includes('--json')) process.stdout.write(text);
                    }),
                  ),
                ),
                child.stderr.pipe(
                  Stream.decodeText(),
                  Stream.runForEach(text =>
                    Effect.sync(() => {
                      stderr += text;
                      process.stderr.write(text);
                    }),
                  ),
                ),
              ],
              { concurrency: 'unbounded' },
            );
            if (exitCode !== 0) {
              // Only the API's explicit missing-script error means first deployment.
              // Authorization, endpoint failures and incompatible storage remain errors.
              if (
                args[0] === 'deployments' &&
                args[1] === 'list' &&
                /\[code: 10007\]/.test(`${stdout}\n${stderr}`)
              ) {
                return { stdout: '[]', records: [] };
              }
              return yield* new ZerospinError({
                code: 'zerospin-wrangler-exited',
                message: `Wrangler ${args.slice(0, 2).join(' ')} exited with code ${exitCode}.`,
                cause: `${stdout}\n${stderr}`.trim(),
              });
            }
            const records = yield* Effect.tryPromise({
              try: async () => {
                if (args.includes('--json')) return [];
                const text = await fs.readFile(outputPath, 'utf8');
                return Schema.decodeUnknownSync(
                  Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
                )(
                  text
                    .trim()
                    .split('\n')
                    .filter(Boolean)
                    .map(line => JSON.parse(line)),
                );
              },
              catch: cause =>
                new ZerospinError({
                  code: 'zerospin-wrangler-output-invalid',
                  message:
                    'Wrangler did not return its structured deployment output.',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
            });
            return { stdout, records };
          },
          Effect.scoped,
          Effect.mapError(cause =>
            ZerospinError.isZerospinError(cause)
              ? cause
              : new ZerospinError({
                  code: 'zerospin-wrangler-process-failed',
                  message: 'Failed to run Wrangler.',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
          ),
        );
        const readDeployment = Effect.gen(function* () {
          const result = yield* runWrangler(['deployments', 'list', '--json']);
          return yield* Effect.try({
            try: () =>
              Schema.decodeUnknownSync(
                Schema.Array(
                  Schema.Struct({
                    id: Schema.String,
                    created_on: Schema.String,
                    annotations: Schema.optionalKey(
                      Schema.Record(Schema.String, Schema.String),
                    ),
                    versions: Schema.Array(
                      Schema.Struct({
                        version_id: Schema.String,
                        percentage: Schema.Number,
                      }),
                    ),
                  }),
                ),
              )(JSON.parse(result.stdout))
                .toSorted((left, right) =>
                  left.created_on.localeCompare(right.created_on),
                )
                .at(-1),
            catch: cause =>
              new ZerospinError({
                code: 'zerospin-wrangler-deployment-invalid',
                message: 'Wrangler returned invalid deployment JSON.',
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
          });
        });
        const incumbent = yield* readDeployment;
        if (
          incumbent !== undefined &&
          (incumbent.versions.length !== 1 ||
            incumbent.versions[0]?.percentage !== 100)
        ) {
          return yield* new ZerospinError({
            code: 'zerospin-deployment-split-rollout',
            message:
              'Production already has a split rollout. Finish or restore that deployment before deploying Zerospin.',
          });
        }
        const incumbentVersion = incumbent?.versions[0]?.version_id;
        const upload = yield* runWrangler([
          ...(incumbentVersion === undefined
            ? ['deploy']
            : ['versions', 'upload']),
          '--secrets-file',
          secretsPath,
        ]);
        const versionId = upload.records.find(
          record =>
            record['type'] ===
            (incumbentVersion === undefined ? 'deploy' : 'version-upload'),
        )?.['version_id'];
        if (
          typeof versionId !== 'string' ||
          !/^[0-9a-f-]{36}$/i.test(versionId)
        ) {
          return yield* new ZerospinError({
            code: 'zerospin-wrangler-version-output-missing',
            message:
              'Wrangler uploaded the Worker but did not report a version ID.',
          });
        }
        const stageMessage = `zerospin-preflight-${randomUUID()}`;
        let staged = false;
        let promoted = false;
        let stagedDeploymentId: string | undefined;
        const recoveryCommand = `wrangler versions deploy ${incumbentVersion}@100% --yes --name ${workerName}`;
        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            if (!staged || promoted || incumbentVersion === undefined) return;
            const current = yield* readDeployment;
            const ownsStage =
              current !== undefined &&
              (current.id === stagedDeploymentId ||
                current.annotations?.['workers/message'] === stageMessage) &&
              current.versions.length === 2 &&
              current.versions.some(
                version =>
                  version.version_id === incumbentVersion &&
                  version.percentage === 100,
              ) &&
              current.versions.some(
                version =>
                  version.version_id === versionId && version.percentage === 0,
              );
            if (!ownsStage) {
              process.stderr.write(
                `The active deployment does not match this command's stage; left it untouched. Inspect: wrangler deployments list --name ${workerName} --json\nIf staging completed after interruption, restore only after checking the active deployment: ${recoveryCommand}\n`,
              );
              return;
            }
            yield* runWrangler([
              'versions',
              'deploy',
              `${incumbentVersion}@100%`,
              '--yes',
            ]);
          }).pipe(
            Effect.catch(error =>
              Effect.sync(() => {
                process.stderr.write(
                  `Deployment rollback failed: ${error.message}\nAfter checking the active deployment, recover with: ${recoveryCommand}\n`,
                );
              }),
            ),
          ),
        );

        if (incumbentVersion === undefined) {
          // Wrangler rejects versions upload for a Worker that does not exist.
          // A first deploy installs the guarded Worker before accepting its spec.
          const initial = yield* readDeployment;
          if (
            initial?.versions.length !== 1 ||
            initial.versions[0]?.version_id !== versionId ||
            initial.versions[0]?.percentage !== 100
          ) {
            return yield* new ZerospinError({
              code: 'zerospin-deployment-changed',
              message:
                'The initial Worker deployment does not match the uploaded version.',
            });
          }
          stagedDeploymentId = initial.id;
        } else {
          // Recheck after upload before altering production; an upload can take minutes.
          const beforeStage = yield* readDeployment;
          if (beforeStage?.id !== incumbent?.id) {
            return yield* new ZerospinError({
              code: 'zerospin-deployment-changed',
              message:
                'Production changed during upload. Candidate was not staged.',
            });
          }
          staged = true;
          const stage = yield* runWrangler([
            'versions',
            'deploy',
            `${incumbentVersion}@100%`,
            `${versionId}@0%`,
            '--yes',
            '--message',
            stageMessage,
          ]);
          const deploymentId = stage.records.find(
            record => record['type'] === 'version-deploy',
          )?.['deployment_id'];
          if (typeof deploymentId !== 'string') {
            return yield* new ZerospinError({
              code: 'zerospin-wrangler-deployment-output-missing',
              message:
                'Wrangler staged the candidate but did not report its deployment ID.',
            });
          }
          stagedDeploymentId = deploymentId;
        }

        const forwarderPath = path.join(tempDirectory, 'forwarder.mjs');
        const forwarderConfigPath = path.join(tempDirectory, 'forwarder.json');
        yield* Effect.tryPromise({
          try: () =>
            Promise.all([
              fs.writeFile(
                forwarderPath,
                `export default {
  async fetch(request, env) {
    const deadline = Date.now() + 30000;
    let actualVersion = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const forwarded = new Request(request.clone(), { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
      forwarded.headers.set('Cloudflare-Workers-Version-Overrides', ${JSON.stringify(`${workerName}="${versionId}"`)});
      const response = await env.PRODUCTION.fetch(forwarded);
      actualVersion = response.headers.get('X-Zerospin-Worker-Version');
      if (actualVersion === ${JSON.stringify(versionId)}) return response;
      await response.body?.cancel();
      if (Date.now() >= deadline || attempt === 9) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return Response.json({ message: 'Candidate version attestation failed', expectedVersion: ${JSON.stringify(versionId)}, actualVersion }, { status: 502 });
  }
};\n`,
                { mode: 0o600 },
              ),
              fs.writeFile(
                forwarderConfigPath,
                JSON.stringify({
                  name: `zerospin-preflight-${randomBytes(8).toString('hex')}`,
                  main: forwarderPath,
                  account_id: wranglerConfig['account_id'],
                  compatibility_date: wranglerConfig['compatibility_date'],
                  services: [
                    {
                      binding: 'PRODUCTION',
                      service: workerName,
                      remote: true,
                    },
                  ],
                }),
                { mode: 0o600 },
              ),
            ]),
          catch: cause =>
            new ZerospinError({
              code: 'zerospin-preflight-forwarder-write-failed',
              message: 'Failed to prepare the local preflight Worker.',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
        });
        const devEnv = yield* Effect.acquireRelease(
          Effect.try({
            try: () => {
              const {
                unstable_DevEnv,
              }: {
                unstable_DevEnv: new () => EventEmitter & {
                  startWorker(input: {
                    config: string;
                    dev: {
                      server: { hostname: string; port: number };
                      inspector: false;
                      persist: false;
                      watch: false;
                    };
                  }): Promise<{ url: Promise<URL> }>;
                  teardown(): Promise<void>;
                };
              } = require(require.resolve('wrangler', { paths: [cwd] }));
              return new unstable_DevEnv();
            },
            catch: cause =>
              new ZerospinError({
                code: 'zerospin-preflight-wrangler-api-failed',
                message: 'Could not load the project Wrangler development API.',
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
          }),
          environment =>
            Effect.tryPromise({
              try: () => environment.teardown(),
              catch: cause =>
                new ZerospinError({
                  code: 'zerospin-preflight-forwarder-stop-failed',
                  message: 'Failed to stop the local preflight Worker.',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
            }).pipe(
              Effect.catch(error =>
                Effect.sync(() => {
                  process.stderr.write(
                    `Deployment cleanup failed: ${error.message}\n`,
                  );
                }),
              ),
            ),
        );
        const forwarderUrl = yield* Effect.tryPromise({
          try: signal =>
            new Promise<string>((resolve, reject) => {
              const onError = (error: unknown) => {
                reject(error);
              };
              const onAbort = () => {
                reject(signal.reason);
              };
              devEnv.once('error', onError);
              signal.addEventListener('abort', onAbort, { once: true });
              devEnv
                .startWorker({
                  config: forwarderConfigPath,
                  dev: {
                    server: { hostname: '127.0.0.1', port: 0 },
                    inspector: false,
                    persist: false,
                    watch: false,
                  },
                })
                .then(worker => worker.url)
                .then(url => resolve(url.toString()), reject)
                .finally(() => {
                  devEnv.off('error', onError);
                  signal.removeEventListener('abort', onAbort);
                });
            }),
          catch: cause =>
            new ZerospinError({
              code: 'zerospin-preflight-forwarder-start-failed',
              message:
                'Failed to start the local Worker with its remote production binding.',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
        }).pipe(
          Effect.timeout('60 seconds'),
          Effect.mapError(cause =>
            ZerospinError.isZerospinError(cause)
              ? cause
              : new ZerospinError({
                  code: 'zerospin-preflight-forwarder-start-failed',
                  message:
                    'The local preflight Worker did not become ready within 60 seconds.',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
          ),
        );
        // HTTP batch sessions are single-use. Each call owns its session in an
        // Effect scope so interruption closes it even while the request awaits.
        const requestSystem = Effect.fn('deployWranglerFn.requestSystem')(
          function* (method: 'checkSystemSpec' | 'healthcheck' | 'initialize') {
            const gatewayApi = yield* Effect.acquireRelease(
              Effect.sync(() => newSyncRpcSession<GatewayApi>(forwarderUrl)),
              session => Effect.sync(() => session[Symbol.dispose]()),
            );
            const response = yield* Effect.tryPromise({
              try: async () =>
                await gatewayApi
                  .getSystemApi({ zerospinSecretKey: configuredSecretKey })
                  [method]({ traceContext: null, args: [] }),
              catch: cause =>
                ZerospinError.isZerospinError(cause)
                  ? cause
                  : new ZerospinError({
                      code: 'zerospin-production-rpc-failed',
                      message: `Worker ${workerName} version ${versionId} failed ${method}.`,
                      cause: ZerospinError.prettyUnknownFailure(cause),
                    }),
            });
            const result = yield* decodeRpc<unknown>(response.result);
            if (method === 'checkSystemSpec') {
              return yield* Schema.decodeUnknownEffect(
                Schema.Struct({
                  workerVersionId: Schema.NullOr(Schema.String),
                }),
              )(result).pipe(
                Effect.mapError(
                  cause =>
                    new ZerospinError({
                      code: 'zerospin-production-version-attestation-invalid',
                      message:
                        'SystemRepo did not report its executing Worker version.',
                      cause: ZerospinError.prettyUnknownFailure(cause),
                    }),
                ),
              );
            }
            return undefined;
          },
          Effect.scoped,
        );
        yield* requestSystem('checkSystemSpec');
        const beforePromotion = yield* readDeployment;
        if (beforePromotion?.id !== stagedDeploymentId) {
          return yield* new ZerospinError({
            code: 'zerospin-deployment-changed',
            message:
              'Production changed during preflight. Candidate was not promoted.',
          });
        }
        if (incumbentVersion !== undefined) {
          yield* runWrangler([
            'versions',
            'deploy',
            `${versionId}@100%`,
            '--yes',
          ]);
        }
        promoted = true;
        // HTTP B can become active while an already assigned SystemRepo still
        // executes A. Its own version must converge before initializing B's services.
        yield* Effect.gen(function* () {
          for (let attempt = 0; attempt < 120; attempt++) {
            const accepted = yield* requestSystem('checkSystemSpec');
            if (accepted?.workerVersionId === versionId) return;
            yield* Effect.sleep('1 second');
          }
          return yield* new ZerospinError({
            code: 'zerospin-deployment-version-assignment-pending',
            message: `Worker ${workerName} version ${versionId} is promoted, but SystemRepo has not switched to it. Initialization was not run.`,
          });
        }).pipe(
          Effect.timeout('180 seconds'),
          Effect.mapError(cause =>
            ZerospinError.isZerospinError(cause)
              ? cause
              : new ZerospinError({
                  code: 'zerospin-deployment-version-assignment-pending',
                  message: `Worker ${workerName} version ${versionId} is promoted, but SystemRepo did not prove its version before initialization.`,
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
          ),
        );
        yield* requestSystem('healthcheck');
        yield* requestSystem('initialize').pipe(
          Effect.mapError(
            cause =>
              new ZerospinError({
                code: 'zerospin-deployment-readiness-failed',
                message: `Worker ${workerName} version ${versionId} was promoted but initialization failed. Accepted spec locks remain durable.`,
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
          ),
        );
        return { workerName, versionId };
      }),
    );
    const deploymentResult = yield* deployment;
    return {
      status: 'deployed',
      ...deploymentResult,
      zerospinPublishableKey: configuredPublishableKey,
    };
  },
  Effect.scoped,
);
