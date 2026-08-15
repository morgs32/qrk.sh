import { createRequire } from 'node:module';

import {
  Command,
  FileSystem,
  Path,
  Terminal,
  type CommandExecutor,
} from '@effect/platform';
import type { Async } from '@zerospin/core/async/Async';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { defaultRetrySchedule } from '@zerospin/core/utils/defaultRetrySchedule';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { loadConfig } from 'c12';
import { config as loadEnv } from 'dotenv';
import { Config, Effect, Option, Queue, Schema, Stream } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

import { loadZerospinConfigFn } from '../deploy/loadZerospinConfigFn.js';

const require = createRequire(import.meta.url);

export const devFn = Effect.fn('devFn')(function* (props: {
  clean: boolean;
  port: number | undefined;
  systemId: ISystemId;
}): Effect.fn.Return<
  Readonly<{ port: number | undefined }>,
  IAnyError,
  | Async
  | CommandExecutor.CommandExecutor
  | FileSystem.FileSystem
  | Path.Path
  | Terminal.Terminal
> {
  const { clean, port: portOption, systemId } = props;
  const cwd = process.cwd();
  const fileSystem = yield* FileSystem.FileSystem;
  const pathApi = yield* Path.Path;
  const terminal = yield* Terminal.Terminal;

  // Project config modules may read process.env while they are imported.
  yield* Effect.sync(() => {
    loadEnv({ path: pathApi.join(cwd, '.env.local') });
    loadEnv({ path: pathApi.join(cwd, '.env') });
  });

  let port = portOption;
  if (port === undefined) {
    const configuredPort = yield* Config.integer('ZEROSPIN_PORT').pipe(
      Config.validate({
        message: 'must be an integer from 1 to 65535',
        validation: value => value >= 1 && value <= 65_535,
      }),
      Config.option,
      Effect.mapError(
        cause =>
          new ZerospinError({
            code: 'zerospin-dev-invalid-port',
            message:
              'Invalid ZEROSPIN_PORT. Expected an integer from 1 to 65535.',
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
      ),
    );
    port = Option.getOrUndefined(configuredPort);
  }

  // Resolve every launch input before starting Wrangler.
  const wranglerBinPath = yield* Effect.try({
    try: () => {
      const wranglerPackageJsonPath = require.resolve('wrangler/package.json', {
        paths: [cwd],
      });
      return pathApi.join(
        pathApi.dirname(wranglerPackageJsonPath),
        'bin',
        'wrangler.js',
      );
    },
    catch: cause =>
      new ZerospinError({
        code: 'zerospin-dev-wrangler-not-found',
        message:
          'Could not resolve Wrangler from the current project. Install wrangler in the project before running zerospin dev.',
        cause: ZerospinError.prettyUnknownFailure(cause),
      }),
  });

  const zerospinConfig = yield* loadZerospinConfigFn(cwd);

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
        code: 'zerospin-dev-wrangler-config-load-failed',
        message: 'Failed to load wrangler.jsonc for zerospin dev.',
        cause: ZerospinError.prettyUnknownFailure(cause),
      }),
  });
  const wranglerConfig = wranglerConfigResult.config;
  const authoredAlias = wranglerConfig['alias'];
  if (
    authoredAlias !== undefined &&
    (authoredAlias === null ||
      typeof authoredAlias !== 'object' ||
      Array.isArray(authoredAlias))
  ) {
    return yield* new ZerospinError({
      code: 'zerospin-dev-wrangler-config-invalid',
      message: 'wrangler.jsonc alias must be an object when present.',
    });
  }
  const authoredVars = wranglerConfig['vars'];
  if (
    authoredVars !== undefined &&
    (authoredVars === null ||
      typeof authoredVars !== 'object' ||
      Array.isArray(authoredVars))
  ) {
    return yield* new ZerospinError({
      code: 'zerospin-dev-wrangler-config-invalid',
      message: 'wrangler.jsonc vars must be an object when present.',
    });
  }

  const devWorkerPath = yield* Effect.try({
    try: () => require.resolve('@zerospin/dev-worker/DevWorker'),
    catch: cause =>
      new ZerospinError({
        code: 'zerospin-dev-worker-not-found',
        message: 'Could not resolve the Zerospin development Worker.',
        cause: ZerospinError.prettyUnknownFailure(cause),
      }),
  });

  const devSeedsEntry = zerospinConfig.seeds.dev;
  const seedModulePath = yield* Effect.try({
    try: () =>
      devSeedsEntry === null
        ? require.resolve(
            pathApi.join(pathApi.dirname(devWorkerPath), 'emptySeeds.js'),
          )
        : require.resolve(pathApi.resolve(cwd, devSeedsEntry)),
    catch: cause =>
      new ZerospinError({
        code: 'zerospin-dev-seeds-not-found',
        message:
          devSeedsEntry === null
            ? 'Could not resolve the built-in empty dev seed module.'
            : `Could not resolve the configured dev seed module ${devSeedsEntry}.`,
        cause: ZerospinError.prettyUnknownFailure(cause),
      }),
  });

  const generatedConfigName = `wrangler.zerospin-dev.${process.pid}.local.json`;
  const generatedConfigPath = pathApi.join(cwd, generatedConfigName);
  const generatedConfig = {
    ...wranglerConfig,
    alias: {
      ...authoredAlias,
      system: pathApi.resolve(cwd, zerospinConfig.entry),
      seeds: seedModulePath,
    },
    vars: {
      ...authoredVars,
      ZEROSPIN_ENVIRONMENT: 'dev',
    },
  };

  const wranglerArgs = [
    wranglerBinPath,
    'dev',
    devWorkerPath,
    '-c',
    `./${generatedConfigName}`,
    '--ip',
    '127.0.0.1',
  ];
  if (port !== undefined) {
    wranglerArgs.push('--port', String(port));
  }
  wranglerArgs.push(
    '--persist-to',
    pathApi.join(
      cwd,
      '.wrangler',
      'zerospin',
      'dev-worker',
      encodeURIComponent(systemId),
    ),
  );

  const removeGeneratedConfig = fileSystem
    .remove(generatedConfigPath, { force: true })
    .pipe(
      Effect.mapError(
        cause =>
          new ZerospinError({
            code: 'zerospin-dev-generated-config-remove-failed',
            message: `Failed to remove generated Wrangler config ${generatedConfigName}.`,
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
      ),
    );

  let wranglerOutput = '';
  const exitCode = yield* Effect.gen(function* () {
    yield* fileSystem
      .writeFileString(
        generatedConfigPath,
        `${JSON.stringify(generatedConfig, null, 2)}\n`,
        { mode: 0o600 },
      )
      .pipe(
        Effect.mapError(
          cause =>
            new ZerospinError({
              code: 'zerospin-dev-generated-config-write-failed',
              message: `Failed to write generated Wrangler config ${generatedConfigName}.`,
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
        ),
      );

    return yield* Effect.scoped(
      Effect.gen(function* () {
        const wranglerProcess = yield* Command.make(
          process.execPath,
          ...wranglerArgs,
        ).pipe(
          Command.workingDirectory(cwd),
          Command.stdin('inherit'),
          Command.stdout('pipe'),
          Command.stderr('inherit'),
          Command.start,
          Effect.mapError(
            cause =>
              new ZerospinError({
                code: 'zerospin-dev-wrangler-start-failed',
                message: 'Failed to start Wrangler for zerospin dev.',
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
          ),
        );
        const activationSignals = yield* Queue.sliding<boolean>(1);
        const reloadCompleteMarker = '⎔ Local server updated and ready';
        let baseUrl: string | undefined;
        let markerBuffer = '';
        let cleanAcknowledged = false;

        const monitorOutput = wranglerProcess.stdout.pipe(
          Stream.decodeText(),
          Stream.runForEach(text =>
            Effect.gen(function* () {
              yield* terminal.display(text);
              wranglerOutput = `${wranglerOutput}${text}`.slice(-16_384);
              markerBuffer = `${markerBuffer}${text}`;

              if (baseUrl === undefined) {
                const readyMatch = markerBuffer.match(
                  /Ready on (http:\/\/[^/\s]+:\d+)/,
                );
                const readyUrl = readyMatch?.[1];
                if (readyMatch === null || readyUrl === undefined) {
                  markerBuffer = markerBuffer.slice(-16_384);
                  return;
                }

                baseUrl = readyUrl;
                markerBuffer = markerBuffer.slice(
                  (readyMatch.index ?? 0) + readyMatch[0].length,
                );
                yield* Queue.offer(activationSignals, true);
              }

              let reloadCompleteIndex =
                markerBuffer.indexOf(reloadCompleteMarker);
              while (reloadCompleteIndex !== -1) {
                markerBuffer = markerBuffer.slice(
                  reloadCompleteIndex + reloadCompleteMarker.length,
                );
                yield* Queue.offer(activationSignals, true);
                reloadCompleteIndex =
                  markerBuffer.indexOf(reloadCompleteMarker);
              }
              markerBuffer = markerBuffer.slice(
                -(reloadCompleteMarker.length - 1),
              );
            }),
          ),
          Effect.mapError(
            cause =>
              new ZerospinError({
                code: 'zerospin-dev-wrangler-output-failed',
                message: 'Failed to read Wrangler output for zerospin dev.',
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
          ),
          Effect.andThen(Effect.never),
        );

        const activateWorkerVersions = Effect.forever(
          Effect.gen(function* () {
            yield* Queue.take(activationSignals);

            if (baseUrl === undefined) {
              return;
            }
            const gatewayApiUrl = baseUrl;

            let deployId: string | null = null;
            let shouldStartDeploy = true;

            while (true) {
              const snapshot = yield* Effect.gen(function* () {
                const encoded = yield* Effect.tryPromise({
                  try: async () => {
                    using gatewayApi =
                      newSyncRpcSession<GatewayApi>(gatewayApiUrl);
                    const devDeployApi = gatewayApi.getDevDeployApi();
                    if (shouldStartDeploy) {
                      return await devDeployApi.startDeploy({
                        clean: clean && !cleanAcknowledged,
                      });
                    }
                    if (deployId === null) {
                      throw new ZerospinError({
                        code: 'zerospin-dev-deploy-response-invalid',
                        message:
                          'The activating local Zerospin deploy omitted its deployId.',
                      });
                    }
                    return await devDeployApi.getDeploy({ deployId });
                  },
                  catch: cause =>
                    ZerospinError.isZerospinError(cause)
                      ? cause
                      : new ZerospinError({
                          code: 'zerospin-dev-start-deploy-failed',
                          message:
                            'Failed to start local Zerospin deploy activation.',
                          cause: ZerospinError.prettyUnknownFailure(cause),
                        }),
                });
                const decoded = yield* decodeRpc(encoded);
                return yield* Schema.decodeUnknown(
                  Schema.Struct({
                    activationCheckpoint: Schema.Literal(
                      'allocated',
                      'generation-prepared',
                      'continuous-replay',
                      'pre-cut-ready',
                      'ownership-cut',
                      'source-writes-terminal',
                      'fixed-point-drained',
                      'final-replay-complete',
                    ),
                    clean: Schema.Boolean,
                    deployId: Schema.String,
                    failure: Schema.NullOr(ZerospinError.schema),
                    generationId: Schema.String,
                    status: Schema.Literal('activating', 'succeeded', 'failed'),
                    workerVersionId: Schema.String,
                  }),
                )(decoded).pipe(
                  Effect.mapError(
                    cause =>
                      new ZerospinError({
                        code: 'zerospin-dev-deploy-response-invalid',
                        message:
                          'The local Zerospin Worker returned an invalid deploy response.',
                        cause: ZerospinError.prettyUnknownFailure(cause),
                      }),
                  ),
                );
              }).pipe(
                Effect.retry({
                  schedule: defaultRetrySchedule,
                  while: error =>
                    error.code === 'zerospin-dev-start-deploy-failed' ||
                    error.code ===
                      (shouldStartDeploy
                        ? 'failed-to-start-deploy-rpc'
                        : 'failed-to-get-deploy-rpc'),
                }),
              );

              if (shouldStartDeploy) {
                cleanAcknowledged = true;
              }

              if (snapshot.status === 'failed') {
                if (snapshot.failure === null) {
                  return yield* new ZerospinError({
                    code: 'zerospin-dev-deploy-response-invalid',
                    message:
                      'The failed local Zerospin deploy omitted its persisted failure.',
                  });
                }
                return yield* snapshot.failure;
              }
              if (snapshot.status === 'succeeded') {
                break;
              }

              deployId = snapshot.deployId;
              shouldStartDeploy = false;
              const workerReloaded = yield* Effect.sleep(250).pipe(
                Effect.as(false),
                Effect.raceFirst(
                  Queue.take(activationSignals).pipe(Effect.as(true)),
                ),
              );
              if (workerReloaded) {
                deployId = null;
                shouldStartDeploy = true;
              }
            }
          }),
        );

        return yield* wranglerProcess.exitCode.pipe(
          Effect.mapError(
            cause =>
              new ZerospinError({
                code: 'zerospin-dev-wrangler-signaled',
                message: 'Wrangler exited before returning an exit code.',
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
          ),
          Effect.raceFirst(activateWorkerVersions),
          Effect.raceFirst(monitorOutput),
        );
      }),
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
      cause: wranglerOutput.length === 0 ? undefined : wranglerOutput,
    });
  }

  return { port };
});
