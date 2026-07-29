import path from 'node:path';

import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import type { Async } from '@zerospin/core/async/Async';
import type { IServiceCommand } from '@zerospin/core/contracts/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import type { ZerospinApis } from '@zerospin/dispatch-worker/ZerospinApis';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { config as loadEnv } from 'dotenv';
import { Effect, Layer } from 'effect';

import { loadSeedsFn } from '../deploy/loadSeedsFn.js';
import { loadZerospinConfigFn } from '../deploy/loadZerospinConfigFn.js';

/** Load and submit the configured production service seeds exactly once. */
export const seedWranglerFn = Effect.fn('seedWranglerFn')(function* (props: {
  environmentId: 'production';
  wrangler: boolean;
}): Effect.fn.Return<
  Readonly<{
    workerUrl: string;
    seedsLoadedCount: number;
    seedCommandsFinalized: number;
  }>,
  IAnyError,
  Async
> {
  if (!props.wrangler) {
    return yield* new ZerospinError({
      code: 'zerospin-seed-wrangler-required',
      message:
        'Production seeds are self-hosted only. Run zerospin seed --wrangler --env production.',
    });
  }

  const cwd = process.cwd();
  yield* Effect.sync(() => {
    loadEnv({ path: path.join(cwd, '.env.local') });
    loadEnv({ path: path.join(cwd, '.env') });
  });

  const zerospinSecretKey = process.env['ZEROSPIN_SECRET_KEY'];
  if (!zerospinSecretKey) {
    return yield* new ZerospinError({
      code: 'zerospin-seed-secret-key-missing',
      message:
        'Missing ZEROSPIN_SECRET_KEY. Use the project-owned self-hosted secret key from .env.local.',
    });
  }
  const configuredWorkerUrl = process.env['ZEROSPIN_WRANGLER_API_URL'] ?? null;
  if (configuredWorkerUrl === null) {
    return yield* new ZerospinError({
      code: 'zerospin-seed-worker-url-missing',
      message:
        'Missing ZEROSPIN_WRANGLER_API_URL. Set it to the workers.dev URL printed by zerospin deploy --wrangler.',
    });
  }
  const workerUrl = yield* Effect.try({
    try: () => {
      const parsed = new URL(configuredWorkerUrl);
      if (
        parsed.protocol !== 'https:' ||
        !parsed.hostname.endsWith('.workers.dev')
      ) {
        throw new Error('Expected an HTTPS workers.dev URL');
      }
      return parsed.origin;
    },
    catch: cause =>
      new ZerospinError({
        code: 'zerospin-seed-worker-url-invalid',
        message:
          'ZEROSPIN_WRANGLER_API_URL must be the self-hosted workers.dev URL printed by zerospin deploy --wrangler.',
        cause: ZerospinError.prettyUnknownFailure(cause),
      }),
  });

  const loadedConfig = yield* loadZerospinConfigFn(cwd).pipe(
    Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
  );
  const seeds = yield* loadSeedsFn({
    ...loadedConfig,
    environmentId: props.environmentId,
  }).pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)));
  if (seeds.length === 0) {
    return yield* new ZerospinError({
      code: 'zerospin-seed-production-empty',
      message:
        'The configured production seed module returned no commands; nothing was submitted.',
    });
  }

  let serviceName: string | undefined;
  const serviceCommands: IServiceCommand[] = [];
  for (const command of seeds) {
    if (command.commandType !== 'service') {
      return yield* new ZerospinError({
        code: 'zerospin-seed-production-command-unsupported',
        message:
          'Self-hosted production seeding currently requires one batch of service commands.',
        extra: { commandId: command.id, commandType: command.commandType },
      });
    }
    if (serviceName === undefined) {
      serviceName = command.serviceName;
    } else if (serviceName !== command.serviceName) {
      return yield* new ZerospinError({
        code: 'zerospin-seed-production-service-mismatch',
        message:
          'Self-hosted production seeds must target one service so they can be submitted as one operation.',
        extra: {
          firstServiceName: serviceName,
          commandId: command.id,
          commandServiceName: command.serviceName,
        },
      });
    }
    serviceCommands.push(command);
  }
  if (serviceName === undefined) {
    return yield* new ZerospinError({
      code: 'zerospin-seed-production-empty',
      message:
        'The configured production seed module returned no commands; nothing was submitted.',
    });
  }

  using apis = newSyncRpcSession<ZerospinApis>(workerUrl);
  const systemApi = apis.getSystemApi({ zerospinSecretKey });
  const envelope = yield* Effect.tryPromise({
    try: () =>
      systemApi.finalizeServiceCommands({
        traceContext: null,
        args: [
          {
            serviceName,
            commands: serviceCommands,
          },
        ],
      }),
    catch: cause =>
      new ZerospinError({
        code: 'zerospin-seed-request-failed',
        message: 'The self-hosted production seed request failed.',
        cause: ZerospinError.prettyUnknownFailure(cause),
        extra: { workerUrl },
      }),
  });
  const result = yield* decodeRpc(envelope.result);
  if (result.failed.length !== 0) {
    return yield* new ZerospinError({
      code: 'zerospin-seed-commands-failed',
      message: `${result.failed.length} production seed command(s) failed.`,
      cause: JSON.stringify(result.failed),
      extra: {
        seedsLoadedCount: seeds.length,
        seedCommandsFinalized: result.executed.length,
      },
    });
  }

  return {
    workerUrl,
    seedsLoadedCount: seeds.length,
    seedCommandsFinalized: result.executed.length,
  };
});
