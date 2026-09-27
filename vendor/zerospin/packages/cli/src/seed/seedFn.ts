import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import {
  UnknownAggregateCommandSchema,
  UnknownServiceCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { encodePayload } from '@zerospin/core/contracts/encodePayload';
import type {
  IAggregateCommand,
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { getApi } from '@zerospin/core/utils/getApi/getApi';
import {
  isZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
  type IAnyError,
} from '@zerospin/error';
import { Effect, FileSystem, Path, Schema } from 'effect';
import { createJiti } from 'jiti';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

import { jitiAliasesFromTsconfigPaths } from '../deploy/jitiAliasesFromTsconfigPaths.js';
import { loadConfigFn } from '../deploy/loadConfigFn.js';

export const seedFn = Effect.fn('seedFn')(function* (props: {
  filePath: string;
  cwd?: string;
}): Effect.fn.Return<
  Readonly<{ commandsSubmitted: number }>,
  IAnyError,
  Async | FileSystem.FileSystem | Path.Path
> {
  const { cwd = process.cwd(), filePath } = props;
  const {
    config,
    zerospinApiUrl: defaultApiUrl,
    zerospinSecretKey,
  } = yield* loadConfigFn(cwd);
  const zerospinApiUrl =
    process.env['ZEROSPIN_API_URL'] ??
    process.env['VITE_ZEROSPIN_API_URL'] ??
    process.env['NEXT_PUBLIC_ZEROSPIN_API_URL'] ??
    defaultApiUrl;
  const { system } = config;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const modulePath = path.resolve(cwd, filePath);
  const commands = yield* Effect.gen(function* () {
    if (!(yield* fs.exists(modulePath))) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'seed-file-missing',
          message: `Seed file does not exist: ${modulePath}.`,
        }),
      );
    }
    const alias = yield* jitiAliasesFromTsconfigPaths(cwd);
    const loaded = yield* makeAsync(() =>
      createJiti(modulePath, {
        alias,
        moduleCache: false,
        tryNative: false,
      }).import(modulePath),
    ).pipe(
      Effect.mapError(cause =>
        makeZerospinError({
          code: 'seed-load-failed',
          message: `Failed to import ${modulePath}.`,
          cause: prettyUnknownFailure(cause),
        }),
      ),
    );
    const exports = yield* Schema.decodeUnknownEffect(
      Schema.Record(Schema.String, Schema.Unknown),
    )(loaded);
    if (exports.seeds === undefined) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'seed-no-commands',
          message: `Missing named seeds array in ${modulePath}.`,
        }),
      );
    }
    const resolved = yield* Schema.decodeUnknownEffect(
      Schema.Array(
        Schema.Union([
          UnknownAggregateCommandSchema,
          UnknownServiceCommandSchema,
        ]),
      ),
    )(exports.seeds, { onExcessProperty: 'error' }).pipe(
      Effect.mapError(cause =>
        makeZerospinError({
          code: 'seed-command-invalid',
          message: `Invalid seeds array in ${modulePath}.`,
          cause: prettyUnknownFailure(cause),
        }),
      ),
    );
    if (resolved.length === 0) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'seed-no-commands',
          message: `No commands in the seeds array exported by ${modulePath}.`,
        }),
      );
    }
    return resolved;
  }).pipe(
    Effect.mapError(cause =>
      isZerospinError(cause)
        ? cause
        : makeZerospinError({
            code: 'seed-load-failed',
            message: `Failed to load seeds from ${modulePath}.`,
            cause: prettyUnknownFailure(cause),
          }),
    ),
  );

  const aggregateCommands: {
    aggregateVersion: string;
    command: IEncodedCommand<IAggregateCommand>;
  }[] = [];
  const serviceCommands: {
    serviceVersion: string;
    command: IEncodedCommand<IServiceCommand>;
  }[] = [];
  for (const command of commands) {
    const { commandName, contractVersion } = command;
    if ('aggregateVersion' in command) {
      const { aggregateName } = command;
      if (command.systemName !== system.name) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'seed-command-invalid',
            message: `Seed command targets system "${command.systemName}", expected "${system.name}".`,
          }),
        );
      }
      const aggregate =
        system.aggregates[aggregateName]?.[command.aggregateVersion];
      const actor = aggregate?.actors[command.actorName];
      const contract =
        actor?.version === command.actorVersion
          ? Object.values(actor.contracts).find(
              candidate =>
                candidate.commandName === commandName &&
                candidate.version === contractVersion,
            )
          : undefined;
      if (contract === undefined) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'seed-command-invalid',
            message: `No aggregate contract matches ${String(aggregateName)}.${String(commandName)}@${String(contractVersion)}.`,
          }),
        );
      }
      const encoded = {
        ...command,
        payload: yield* encodePayload(contract, {
          version: contract.version,
          payload: command.payload,
        }),
      };
      aggregateCommands.push({
        aggregateVersion: command.aggregateVersion,
        command: encoded,
      });
      continue;
    }
    if ('serviceVersion' in command) {
      const { serviceName } = command;
      const service = system.services[serviceName]?.[command.serviceVersion];
      const contract = service
        ? Object.values(service.contracts).find(
            candidate =>
              candidate.commandName === commandName &&
              candidate.version === contractVersion,
          )
        : undefined;
      if (contract === undefined) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'seed-command-invalid',
            message: `No service contract matches ${String(serviceName)}.${String(commandName)}@${String(contractVersion)}.`,
          }),
        );
      }
      const encoded = {
        ...command,
        payload: yield* encodePayload(contract, {
          version: contract.version,
          payload: command.payload,
        }),
      };
      serviceCommands.push({
        serviceVersion: command.serviceVersion,
        command: encoded,
      });
      continue;
    }
    return yield* Effect.fail(
      makeZerospinError({
        code: 'seed-command-invalid',
        message: 'Seed command must identify an aggregate or service version.',
      }),
    );
  }

  const systemApi = yield* getApi<GatewayApi>(zerospinApiUrl)(gatewayApi =>
    gatewayApi.getSystemApi({ zerospinSecretKey }),
  );
  yield* Effect.all(
    [
      Effect.forEach(
        aggregateCommands,
        command => systemApi.executeAggregateCommand(command),
        { concurrency: 'unbounded' },
      ),
      Effect.forEach(
        serviceCommands,
        command => systemApi.executeServiceCommand(command),
        { concurrency: 'unbounded' },
      ),
    ],
    { concurrency: 'unbounded' },
  ).pipe(
    Effect.mapError(cause =>
      makeZerospinError({
        code: 'seed-submit-failed',
        message: `Failed to submit seeds to ${zerospinApiUrl}.`,
        cause: prettyUnknownFailure(cause),
      }),
    ),
  );

  return { commandsSubmitted: commands.length };
});
