import type { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

import type { Async } from '@zerospin/core/async/Async';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import { makeWranglerConfig } from '@zerospin/dev-worker/makeWranglerConfig';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { config as loadEnv } from 'dotenv';
import {
  Config,
  Deferred,
  Effect,
  FileSystem,
  Option,
  Path,
  Queue,
  Terminal,
  type Scope,
} from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

import { loadZerospinConfigFn } from '../deploy/loadZerospinConfigFn.js';
import { makeSystemEntry } from '../deploy/makeSystemEntry.js';

const require = createRequire(import.meta.url);

export const devFn = Effect.fn('devFn')(function* (props: {
  clean: boolean;
  port: number | undefined;
}): Effect.fn.Return<
  Readonly<{ port: number | undefined }>,
  IAnyError,
  Async | Scope.Scope | FileSystem.FileSystem | Path.Path | Terminal.Terminal
> {
  const { clean, port: portOption } = props;
  let port = portOption;
  const stopped = yield* Deferred.make<void, IAnyError>();
  const stop = () => Deferred.doneUnsafe(stopped, Effect.void);
  // Miniflare's programmatic runtime installs signal hooks that call
  // process.exit immediately, bypassing our asynchronous scope cleanup. Own
  // those signals here, retaining its ordinary exit hook and other listeners.
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
      // newListener fires before installation; native signal delivery follows
      // this turn's microtasks, so remove the immediate-exit hook afterwards.
      globalThis.queueMicrotask(() => process.off(signal, listener));
    }
  };
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      process.off('SIGHUP', stop);
      process.off('newListener', ownWranglerSignals);
    }),
  );
  yield* Effect.sync(() => {
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    process.on('SIGHUP', stop);
    process.on('newListener', ownWranglerSignals);
  });
  yield* Effect.gen(function* () {
    const cwd = process.cwd();
    const fileSystem = yield* FileSystem.FileSystem;
    const pathApi = yield* Path.Path;
    const terminal = yield* Terminal.Terminal;

    yield* Effect.sync(() => {
      loadEnv({ path: pathApi.join(cwd, '.env.local') });
      loadEnv({ path: pathApi.join(cwd, '.env') });
    });

    if (port === undefined) {
      const configuredPort = yield* Config.port('ZEROSPIN_PORT').pipe(
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

    const wrangler = yield* Effect.try({
      try: () => {
        const wranglerPath = require.resolve('wrangler', { paths: [cwd] });
        const wrangler: {
          unstable_getVarsForDev(
            configPath: string,
            envFiles: undefined,
            vars: Record<string, string>,
            env: undefined,
            silent: boolean,
          ): Record<string, { type: string; value: unknown }>;
          unstable_DevEnv: new () => EventEmitter & {
            startWorker(options: {
              config: string;
              entrypoint: string;
              bindings: Record<string, { type: string; value: unknown }>;
              dev: {
                server: { hostname: string; port: number | undefined };
                persist: string;
                watch: boolean;
              };
            }): Promise<{ url: Promise<URL> }>;
            proxy: { runtimeMessageMutex: { drained(): Promise<void> } };
            teardown(): Promise<void>;
          };
        } = require(wranglerPath);
        if (typeof wrangler.unstable_DevEnv !== 'function') {
          throw new Error('Wrangler does not expose unstable_DevEnv.');
        }
        return wrangler;
      },
      catch: cause =>
        new ZerospinError({
          code: 'zerospin-dev-wrangler-not-found',
          message:
            'Could not load the Wrangler development API from the current project. Install a Wrangler version exposing unstable_DevEnv.',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });
    const devWorkerPath = yield* Effect.try({
      try: () => require.resolve('@zerospin/dev-worker/DevWorker'),
      catch: cause =>
        new ZerospinError({
          code: 'zerospin-dev-worker-not-found',
          message: 'Could not resolve the Zerospin development Worker.',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });

    const config = yield* loadZerospinConfigFn(cwd);
    const { systemId } = config;
    const systemEntry = yield* makeSystemEntry(cwd);
    const generatedConfig = yield* Effect.try({
      try: () =>
        makeWranglerConfig({
          config,
          main: devWorkerPath,
          systemModulePath: systemEntry,
          environment: 'dev',
        }),
      catch: cause =>
        ZerospinError.isZerospinError(cause)
          ? cause
          : new ZerospinError({
              code: 'zerospin-dev-config-failed',
              message: 'Failed to generate backend configuration.',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
    });
    const generatedConfigPath = pathApi.join(
      pathApi.dirname(systemEntry),
      'wrangler.json',
    );
    // Resolve local secrets against the project root, independently of the
    // generated config directory. Wrangler retains its .dev.vars/.env precedence.
    const bindings = yield* Effect.try({
      try: () => ({
        ...wrangler.unstable_getVarsForDev(
          pathApi.join(cwd, 'zerospin.config.ts'),
          undefined,
          {},
          undefined,
          true,
        ),
        ZEROSPIN_ENVIRONMENT: { type: 'plain_text', value: 'dev' },
        ZEROSPIN_SYSTEM_ID: { type: 'plain_text', value: systemId },
      }),
      catch: cause =>
        new ZerospinError({
          code: 'zerospin-dev-env-load-failed',
          message: 'Failed to load project environment bindings.',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });
    const persistPath = pathApi.join(
      cwd,
      '.wrangler',
      'zerospin',
      'dev-worker',
      encodeURIComponent(systemId),
    );
    if (clean) {
      yield* fileSystem
        .remove(persistPath, { force: true, recursive: true })
        .pipe(
          Effect.mapError(
            cause =>
              new ZerospinError({
                code: 'zerospin-dev-clean-failed',
                message: `Failed to remove local Zerospin state at ${persistPath}.`,
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
          ),
        );
    }

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
              message: `Failed to write generated Wrangler config ${generatedConfigPath}.`,
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
        ),
      );

    const reloads = yield* Queue.make<void>();
    const devEnv = yield* Effect.acquireRelease(
      Effect.sync(() => new wrangler.unstable_DevEnv()),
      environment =>
        Effect.tryPromise(() => environment.teardown()).pipe(
          Effect.catch(cause =>
            Effect.logError(
              new ZerospinError({
                code: 'zerospin-dev-wrangler-cleanup-failed',
                message:
                  'Failed to dispose the Wrangler development environment.',
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
            ),
          ),
        ),
    );
    // Wrangler emits reloadComplete for the initial bundle too. Attach before
    // startup so even a fast initial load is checked before serving is reported.
    yield* Effect.sync(() => {
      devEnv.on('reloadComplete', () => Queue.offerUnsafe(reloads, undefined));
      devEnv.on('error', cause =>
        Deferred.doneUnsafe(
          stopped,
          Effect.fail(
            new ZerospinError({
              code: 'zerospin-dev-wrangler-failed',
              message: 'The Wrangler development environment failed.',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
          ),
        ),
      );
      devEnv.on('teardown', stop);
    });
    const worker = yield* Effect.tryPromise({
      try: () =>
        devEnv.startWorker({
          config: generatedConfigPath,
          entrypoint: devWorkerPath,
          bindings,
          dev: {
            server: { hostname: '127.0.0.1', port },
            persist: persistPath,
            watch: true,
          },
        }),
      catch: cause =>
        new ZerospinError({
          code: 'zerospin-dev-wrangler-start-failed',
          message: 'Failed to start Wrangler for zerospin dev.',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });
    while (true) {
      yield* Queue.take(reloads);
      const apiUrl = yield* Effect.tryPromise(async () => {
        const url = await worker.url;
        // The reload event precedes completion of the proxy's update message.
        // Wait for it before asking the executing Worker to accept its spec.
        await devEnv.proxy.runtimeMessageMutex.drained();
        return url.toString();
      }).pipe(
        Effect.timeout('30 seconds'),
        Effect.mapError(
          cause =>
            new ZerospinError({
              code: 'zerospin-dev-wrangler-not-ready',
              message:
                'Wrangler did not finish loading the development Worker.',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
        ),
      );
      yield* Effect.scoped(
        Effect.gen(function* () {
          const gatewayApi = yield* Effect.acquireRelease(
            Effect.sync(() => newSyncRpcSession<GatewayApi>(apiUrl)),
            session => Effect.sync(() => session[Symbol.dispose]()),
          );
          const response = yield* Effect.tryPromise(() =>
            gatewayApi
              .getSystemApi({ zerospinSecretKey: 'sk_dev' })
              .checkSystemSpec({
                traceContext: null,
                args: [],
              }),
          );
          yield* decodeRpc(response.result);
        }),
      ).pipe(
        Effect.timeout('30 seconds'),
        Effect.mapError(cause =>
          ZerospinError.isZerospinError(cause)
            ? cause
            : new ZerospinError({
                code: 'zerospin-dev-system-spec-check-failed',
                message:
                  'The development Worker did not accept its authored system spec.',
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
        ),
      );
      yield* terminal
        .display(`Ready on ${apiUrl} (system spec accepted)\n`)
        .pipe(
          Effect.mapError(
            cause =>
              new ZerospinError({
                code: 'zerospin-dev-wrangler-output-failed',
                message: 'Failed to display development Worker readiness.',
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
          ),
        );
    }
  }).pipe(Effect.raceFirst(Deferred.await(stopped)));

  return { port };
}, Effect.scoped);
