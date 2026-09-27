import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import { getCommandContracts } from '@zerospin/core/automation/getCommandContracts';
import { decodePayload } from '@zerospin/core/contracts/decodePayload/decodePayload';
import {
  encodeBusinessFailure,
  validateFailure,
} from '@zerospin/core/contracts/failureCodec';
import { runContractGuard } from '@zerospin/core/contracts/runContractGuard';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { runProgram } from '@zerospin/core/execution/runProgram';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { isZerospinError, makeZerospinError } from '@zerospin/error';
import config from 'config';
import { Effect, Result, Schema } from 'effect';

import { makeOptimisticActorDb } from '../optimistic/makeOptimisticActorDb.js';
import { readPendingActorCommands } from '../retainedCommands.js';

/** Preview actor guards against the current derived optimistic view without retaining a command. */
export const validateCommands = Effect.fn(
  'AggregateActorVersionRepo.validateCommands',
)(function* (props: {
  db: IDb;
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: string;
    actorName: string;
    actorVersion: string;
    actorPath: string;
  };
  commands: readonly IEncodedCommand<IAggregateCommand>[];
}) {
  const { db, key, commands } = props;
  const aggregate = yield* getByKeyOrThrow({
    record: config.system.aggregates[key.aggregateName] ?? {},
    key: key.aggregateVersion,
    recordKind: 'aggregate versions',
  });
  const actor = yield* resolveAggregateActorVersion(
    { [aggregate.version]: aggregate },
    key,
  );
  const rows = yield* readPendingActorCommands(db, key.aggregateVersion);
  const optimistic = yield* makeOptimisticActorDb({
    authoritativeDb: db,
    models: aggregate.models,
    pending: rows
      .filter(row => row.resolvedAt === null)
      .map(row => ({
        commandId: row.id,
        appliedAt: row.stagedAt,
        mutations: row.mutations,
      })),
  });
  const context = yield* config.system.runtime.contextEffect;
  return yield* Effect.forEach(commands, command =>
    Effect.gen(function* () {
      if (
        command.aggregateId !== key.aggregateId ||
        command.aggregateName !== key.aggregateName ||
        command.actorName !== key.actorName ||
        command.actorVersion !== key.actorVersion
      ) {
        return yield* makeZerospinError('validation-actor-mismatch');
      }
      const contract = yield* getByKeyOrThrow({
        record: getCommandContracts(actor, command),
        key: command.commandName,
        recordKind: 'actor contracts',
      });
      const identity = yield* Schema.decodeUnknownEffect(
        command.automationName == null
          ? actor.identity.identitySchema
          : actor.identity.actorSchema,
      )(command.identity);
      const payload = yield* decodePayload(contract, { command });
      const checked = yield* Effect.gen(function* () {
        yield* runContractGuard({
          contract,
          queryDb: optimistic.queryDb,
          payload,
          identity,
        });
        yield* runProgram(
          Effect.suspend(
            () =>
              actor.guards[command.commandName]?.({
                queryDb: optimistic.queryDb,
                payload,
                identity,
                failures: contract.failures,
              }) ?? Effect.void,
          ),
        ).pipe(
          Effect.catch(failure =>
            isZerospinError(failure) && !('scope' in failure)
              ? Effect.fail(failure)
              : validateFailure(contract, failure, 'actor').pipe(
                  Effect.flatMap(Effect.fail),
                ),
          ),
        );
      }).pipe(Effect.provideContext(context), Effect.result);
      if (Result.isFailure(checked)) {
        if (isZerospinError(checked.failure) && !('scope' in checked.failure)) {
          return yield* Effect.fail(checked.failure);
        }
        return {
          commandId: command.id,
          stagingFailure: yield* encodeBusinessFailure(
            contract,
            checked.failure,
          ),
        };
      }
      return { commandId: command.id, stagingFailure: null };
    }),
  );
});
