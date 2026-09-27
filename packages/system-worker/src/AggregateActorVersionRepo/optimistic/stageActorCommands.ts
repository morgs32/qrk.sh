import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import { getCommandContracts } from '@zerospin/core/automation/getCommandContracts';
import { applyAggregateMutationTx } from '@zerospin/core/contracts/applyAggregateMutationTx';
import { decodePayload } from '@zerospin/core/contracts/decodePayload/decodePayload';
import { encodeMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import {
  encodeBusinessFailure,
  validateFailure,
  type IFailure,
} from '@zerospin/core/contracts/failureCodec';
import { makeMutations } from '@zerospin/core/contracts/make/makeMutations';
import { prepareReplayAppliedMutation } from '@zerospin/core/contracts/prepareReplayAppliedMutation';
import { runContractGuard } from '@zerospin/core/contracts/runContractGuard';
import type {
  IAggregateCommand,
  IEncodedCommand,
  IEncodedMutation,
} from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import { runProgram } from '@zerospin/core/execution/runProgram';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { isZerospinError, makeZerospinError } from '@zerospin/error';
import config from 'config';
import { eq } from 'drizzle-orm';
import { Effect, Result, Schema, type Semaphore } from 'effect';
import { isEqual } from 'es-toolkit';

import { getReplicatedResources } from '../../AggregateVersionRepo/getReplicatedResources/getReplicatedResources.js';
import { aggregateActorVersionRepoDbConfig } from '../aggregateActorVersionRepoDbConfig.js';
import {
  commandRowForSource,
  commandRowInput,
  decodeRetainedAggregateCommand,
  readPendingActorCommands,
} from '../retainedCommands.js';

import { makeOptimisticActorDb } from './makeOptimisticActorDb.js';

/** Stage against a disposable optimistic view; commit only prepared operations and delivery work. */
export const stageActorCommands = Effect.fn(
  'AggregateActorVersionRepo.stageActorCommands',
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
  automationExecutedIndex?: number;
  actorWrites?: Effect.Success<ReturnType<typeof Semaphore.make>>;
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
  const table = aggregateActorVersionRepoDbConfig.schema.pendingCommands;
  const confirmedIndex =
    db
      .select()
      .from(aggregateActorVersionRepoDbConfig.schema.actorState)
      .where(eq(aggregateActorVersionRepoDbConfig.schema.actorState.id, 1))
      .get()?.executedIndex ?? 0;
  const existing = yield* readPendingActorCommands(db, key.aggregateVersion);
  const scratch = yield* makeOptimisticActorDb({
    authoritativeDb: db,
    models: aggregate.models,
    pending: existing
      .filter(row => row.resolvedAt === null)
      .map(row => ({
        commandId: row.id,
        appliedAt: row.stagedAt,
        mutations: row.mutations,
      })),
  });
  const context = yield* config.system.runtime.contextEffect;
  const staged: {
    command: IEncodedCommand<IAggregateCommand>;
    stagedAt: Date;
    mutations: IEncodedMutation[];
  }[] = [];
  const outcomes: { commandId: string; stagingFailure: IFailure | null }[] = [];

  for (const command of commands) {
    if (
      command.aggregateId !== key.aggregateId ||
      command.aggregateName !== key.aggregateName ||
      ('aggregateVersion' in command &&
        command.aggregateVersion !== key.aggregateVersion) ||
      command.systemName !== config.system.name ||
      command.actorName !== key.actorName ||
      command.actorVersion !== key.actorVersion
    ) {
      return yield* makeZerospinError('staging-actor-mismatch');
    }
    if (
      (props.automationExecutedIndex === undefined &&
        command.automationName != null) ||
      (props.automationExecutedIndex !== undefined &&
        command.automationName == null)
    ) {
      return yield* makeZerospinError('automation-authority-required');
    }
    const duplicate = existing.find(row => row.id === command.id);
    if (duplicate !== undefined) {
      if (
        !isEqual(
          {
            commandName: duplicate.commandName,
            contractVersion: duplicate.contractVersion,
            payload: duplicate.payload,
            aggregateId: duplicate.aggregateId,
            aggregateName: duplicate.aggregateName,
            aggregateVersion: duplicate.aggregateVersion,
            systemName: duplicate.systemName,
            actorName: duplicate.actorName,
            actorVersion: duplicate.actorVersion,
            claims: duplicate.claims,
            nodeId: duplicate.nodeId,
            sessionName: duplicate.sessionName,
            nodeIndex: duplicate.nodeIndex,
            automationName: duplicate.automationName,
          },
          {
            commandName: command.commandName,
            contractVersion: command.contractVersion,
            payload: command.payload,
            aggregateId: command.aggregateId,
            aggregateName: command.aggregateName,
            aggregateVersion:
              'aggregateVersion' in command
                ? command.aggregateVersion
                : key.aggregateVersion,
            systemName: command.systemName,
            actorName: command.actorName,
            actorVersion: command.actorVersion,
            claims: command.claims,
            nodeId: command.nodeId,
            sessionName: command.sessionName,
            nodeIndex: command.nodeIndex,
            automationName: command.automationName ?? null,
          },
        )
      ) {
        return yield* makeZerospinError('staging-command-identity-mismatch');
      }
      outcomes.push({ commandId: command.id, stagingFailure: null });
      continue;
    }
    const stagedDuplicate = staged.find(row => row.command.id === command.id);
    if (stagedDuplicate !== undefined) {
      if (!isEqual(stagedDuplicate.command, command)) {
        return yield* makeZerospinError('staging-command-identity-mismatch');
      }
      outcomes.push({ commandId: command.id, stagingFailure: null });
      continue;
    }
    const contract = yield* getByKeyOrThrow({
      record: getCommandContracts(actor, command),
      key: command.commandName,
      recordKind: 'actor contracts',
    });
    const claims = yield* Schema.decodeUnknownEffect(
      command.automationName == null
        ? actor.identity.claimsSchema
        : actor.identity.identitySchema,
    )(command.claims);
    const payload = yield* decodePayload(contract, { command });
    const attempted = yield* Effect.gen(function* () {
      yield* runContractGuard({
        contract,
        queryDb: scratch.queryDb,
        payload,
        claims,
      });
      yield* runProgram(
        Effect.suspend(
          () =>
            actor.guards[command.commandName]?.({
              queryDb: scratch.queryDb,
              payload,
              claims,
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
      const made = yield* makeMutations({
        contract,
        models: aggregate.models,
        command: { ...command, payload },
        claims,
      });
      const captured = yield* getReplicatedResources({
        systemId: key.systemId,
        mutations: made.mutations,
        services: aggregate.services,
      });
      const mutations = yield* Effect.forEach(
        made.mutations,
        (mutation, mutationIndex) =>
          Effect.gen(function* () {
            const snapshot =
              mutation.operationName === 'replicate'
                ? captured.find(
                    copy =>
                      copy.modelName === mutation.model.modelName &&
                      copy.resourceId === mutation.resourceId &&
                      copy.operation.serviceName ===
                        mutation.operation.serviceName,
                  )
                : undefined;
            if (
              mutation.operationName === 'replicate' &&
              snapshot === undefined
            ) {
              return yield* makeZerospinError(
                'staging-replica-snapshot-missing',
              );
            }
            const prepared =
              snapshot === undefined
                ? mutation
                : yield* prepareReplayAppliedMutation({
                    controller: aggregate,
                    mutation: {
                      ...snapshot,
                      operation: JSON.stringify(snapshot.operation),
                    },
                  });
            return yield* encodeMutation({
              commandId: command.id,
              mutationIndex,
              mutation: prepared,
            });
          }),
      );
      const stagedAt = new Date();
      yield* makeTx('ActorStaging.preview')(function* (tx) {
        yield* withSavepoint({
          tx,
          program: ({ tx: candidateTx }) =>
            Effect.forEach(mutations, encoded =>
              Effect.gen(function* () {
                const mutation = yield* prepareReplayAppliedMutation({
                  mutation: encoded,
                  controller: aggregate,
                });
                yield* applyAggregateMutationTx({
                  tx: candidateTx,
                  mutation,
                  commandId: command.id,
                  mutationIndex: encoded.mutationIndex,
                  appliedAt: stagedAt,
                });
              }),
            ),
        });
      })(scratch.db);
      return { command, stagedAt, mutations };
    }).pipe(Effect.provideContext(context), Effect.result);
    if (Result.isFailure(attempted)) {
      if (
        isZerospinError(attempted.failure) &&
        !('scope' in attempted.failure)
      ) {
        return yield* Effect.fail(attempted.failure);
      }
      outcomes.push({
        commandId: command.id,
        stagingFailure: yield* encodeBusinessFailure(
          contract,
          attempted.failure,
        ),
      });
      continue;
    }
    staged.push(attempted.success);
    outcomes.push({ commandId: command.id, stagingFailure: null });
  }

  if (staged.length === 0) return outcomes;
  const commit = makeTx('ActorStaging.commit')(function* (tx) {
    let stageIndex = existing.at(-1)?.stageIndex ?? 0;
    const retained = tx.select().from(table).orderBy(table.stageIndex).all();
    const currentConfirmedIndex =
      tx
        .select()
        .from(aggregateActorVersionRepoDbConfig.schema.actorState)
        .where(eq(aggregateActorVersionRepoDbConfig.schema.actorState.id, 1))
        .get()?.executedIndex ?? 0;
    if (
      retained.length !== existing.length ||
      (retained.at(-1)?.stageIndex ?? 0) !== stageIndex ||
      currentConfirmedIndex !== confirmedIndex ||
      retained.some(
        (row, index) =>
          row.commandRowId !== existing[index]?.commandRowId ||
          row.resolvedAt?.getTime() !== existing[index]?.resolvedAt?.getTime(),
      )
    ) {
      return yield* makeZerospinError('staging-basis-changed');
    }
    for (const entry of staged) {
      const { command, stagedAt, mutations } = entry;
      stageIndex += 1;
      const saved = commandRowForSource(tx, command);
      let commandRowId: `row_${string}`;
      if (saved === undefined) {
        commandRowId = `row_${crypto.randomUUID()}`;
        tx.insert(aggregateActorVersionRepoDbConfig.schema.commands)
          .values(
            yield* aggregateActorVersionRepoDbConfig.tables.commands.encodeRow(
              commandRowInput({
                rowId: commandRowId,
                command,
                aggregateVersion: key.aggregateVersion,
              }),
            ),
          )
          .run();
      } else {
        commandRowId = saved.rowId;
        const decoded =
          yield* aggregateActorVersionRepoDbConfig.tables.commands.decodeRow(
            saved,
          );
        const retainedCommand = yield* decodeRetainedAggregateCommand(decoded);
        if (!isEqual(retainedCommand, command)) {
          return yield* makeZerospinError('staging-command-identity-mismatch');
        }
      }
      const row =
        yield* aggregateActorVersionRepoDbConfig.tables.pendingCommands.encodeRow(
          {
            stageIndex,
            commandRowId,
            stagedAt,
            mutations,
            resolvedAt: null,
            acknowledgedAt: null,
            lastDeliveryFailure: null,
          },
        );
      tx.insert(table).values(row).run();
    }
  })(db);
  yield* props.actorWrites === undefined
    ? commit
    : props.actorWrites.withPermits(1)(commit);
  return outcomes;
});

/** Preparation may race a confirmed projection or another staged batch; rebuild from the new basis. */
export const stageActorCommandsWithRetry = (
  props: Parameters<typeof stageActorCommands>[0],
) =>
  stageActorCommands(props).pipe(
    Effect.retry({
      while: error =>
        isZerospinError(error) && error.code === 'staging-basis-changed',
      times: 3,
    }),
  );
