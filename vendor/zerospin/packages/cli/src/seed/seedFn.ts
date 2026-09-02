import type { Async } from '@zerospin/core/async/Async';
import type {
  IAggregateCommand,
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import type { ISystemEnvironmentId } from '@zerospin/core/system/types';
import { executeRpc } from '@zerospin/core/utils/executeRpc';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Path, type FileSystem } from 'effect';
import { createJiti } from 'jiti';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

import { jitiAliasesFromTsconfigPaths } from '../deploy/jitiAliasesFromTsconfigPaths.js';
import { loadConfigFn } from '../deploy/loadConfigFn.js';
import { loadSystemFn } from '../deploy/loadSystemFn.js';

export const seedFn = Effect.fn('seedFn')(function* (props: {
  environmentId: ISystemEnvironmentId;
  cwd?: string;
}): Effect.fn.Return<
  Readonly<{ commandsFinalized: number }>,
  IAnyError,
  Async | FileSystem.FileSystem | Path.Path
> {
  const cwd = props.cwd ?? process.cwd();
  const pathApi = yield* Path.Path;
  const { config, zerospinApiUrl, zerospinSecretKey } = yield* loadConfigFn();
  const seedsEntry = config.seeds[props.environmentId];
  if (seedsEntry === null) {
    return yield* new ZerospinError({
      code: 'seed-module-not-configured',
      message: `No seed module is configured for ${props.environmentId}.`,
    });
  }
  const system = yield* loadSystemFn(config, cwd);
  const seedsPath = pathApi.resolve(cwd, seedsEntry);
  const jitiAliases = yield* jitiAliasesFromTsconfigPaths(cwd).pipe(
    Effect.mapError(
      cause =>
        new ZerospinError({
          code: 'seed-module-import-failed',
          message: 'Failed to read tsconfig.json aliases for the seed module.',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    ),
  );
  const loadedModule = yield* Effect.tryPromise({
    try: () =>
      createJiti(seedsPath, {
        alias: jitiAliases,
        moduleCache: false,
        tryNative: false,
      }).import(seedsPath),
    catch: cause =>
      new ZerospinError({
        code: 'seed-module-import-failed',
        message: `Failed to import ${seedsEntry}.`,
        cause: ZerospinError.prettyUnknownFailure(cause),
      }),
  });
  const seeds =
    loadedModule !== null && typeof loadedModule === 'object'
      ? Reflect.get(loadedModule, 'seeds')
      : undefined;
  if (!Effect.isEffect(seeds)) {
    return yield* new ZerospinError({
      code: 'seed-module-invalid',
      message: `${seedsEntry} must export const seeds as a makeSeeds Effect.`,
    });
  }
  const commands = yield* seeds.pipe(
    Effect.provide(NanoIdFactory),
    Effect.mapError(cause =>
      ZerospinError.isZerospinError(cause)
        ? cause
        : new ZerospinError({
            code: 'seed-module-invalid',
            message: `Failed to resolve seeds from ${seedsEntry}.`,
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
    ),
  );
  if (!Array.isArray(commands)) {
    return yield* new ZerospinError({
      code: 'seed-module-invalid',
      message: `${seedsEntry} did not resolve to a command array.`,
    });
  }

  const aggregateCommands: IEncodedCommand<IAggregateCommand>[] = [];
  const serviceCommands: IEncodedCommand<IServiceCommand>[] = [];
  for (const command of commands) {
    if (command === null || typeof command !== 'object') {
      return yield* new ZerospinError({
        code: 'seed-command-invalid',
        message: 'Seed modules must resolve only command objects.',
      });
    }
    const commandName = Reflect.get(command, 'commandName');
    const contractVersion = Reflect.get(command, 'contractVersion');
    const aggregateName = Reflect.get(command, 'aggregateName');
    const serviceName = Reflect.get(command, 'serviceName');
    if (typeof aggregateName === 'string' && serviceName === undefined) {
      const aggregate =
        system.aggregates[aggregateName];
      const contract = aggregate
        ? Object.values(aggregate.contracts).find(
            candidate =>
              candidate.commandName === commandName &&
              candidate.version === contractVersion,
          )
        : undefined;
      if (contract === undefined) {
        return yield* new ZerospinError({
          code: 'seed-command-invalid',
          message: `No aggregate contract matches ${String(aggregateName)}.${String(commandName)}@${String(contractVersion)}.`,
        });
      }
      const encoded = {
        ...command,
        payload: yield* contract.encodePayload({
          payload: Reflect.get(command, 'payload'),
        }),
      };
      aggregateCommands.push(encoded);
      continue;
    }
    if (typeof serviceName === 'string' && aggregateName === undefined) {
      const service =
        system.services[serviceName];
      const contract = service
        ? Object.values(service.contracts).find(
            candidate =>
              candidate.commandName === commandName &&
              candidate.version === contractVersion,
          )
        : undefined;
      if (contract === undefined) {
        return yield* new ZerospinError({
          code: 'seed-command-invalid',
          message: `No service contract matches ${String(serviceName)}.${String(commandName)}@${String(contractVersion)}.`,
        });
      }
      const encoded = {
        ...command,
        payload: yield* contract.encodePayload({
          payload: Reflect.get(command, 'payload'),
        }),
      };
      serviceCommands.push(encoded);
      continue;
    }
    return yield* new ZerospinError({
      code: 'seed-command-invalid',
      message: 'Seed command must identify exactly one aggregate or service.',
    });
  }

  yield* executeRpc<GatewayApi>(zerospinApiUrl)(gatewayApi => {
    const systemApi = gatewayApi.getSystemApi({ zerospinSecretKey });
    return Effect.all(
      [
        Effect.forEach(
          aggregateCommands,
          command => systemApi.finalizeAggregateCommand(command),
          { concurrency: 'unbounded' },
        ),
        Effect.forEach(
          serviceCommands,
          command => systemApi.finalizeServiceCommand(command),
          { concurrency: 'unbounded' },
        ),
      ],
      { concurrency: 'unbounded' },
    );
  }).pipe(
    Effect.mapError(
      cause =>
        new ZerospinError({
          code: 'seed-submit-failed',
          message: `Failed to submit seeds to ${zerospinApiUrl}.`,
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    ),
  );

  return { commandsFinalized: commands.length };
});
