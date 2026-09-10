import {
  AggregateChainedCommandSchema,
  EncodedAggregateCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { encodeMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeMutations } from '@zerospin/core/contracts/makeMutations';
import { prepareReplayAppliedMutation } from '@zerospin/core/contracts/prepareReplayAppliedMutation';
import type { IDb } from '@zerospin/core/drizzle/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Layer, Result, Schema, type Semaphore } from 'effect';
import { system } from 'system';

import { getReplicatedResources } from '../getReplicatedResources/getReplicatedResources.js';
import {
  VersionedAggregateRepoDb,
  versionedAggregateRepoDbConfig,
} from '../versionedAggregateRepoDbConfig.js';

import { executeCommandsTx } from './executeCommandsTx.js';

/** Prepare supplied admitted rows and atomically commit contiguous version-owned results.
 * Committed rows are skipped under the execution permit; page failures roll back all writes.
 *
 * 1. Skip committed rows under the execution permit.
 * 2. Prepare immutable execution inputs.
 * 3. Execute contiguous inputs and atomically commit terminal history with resource state.
 */
export const executeCommands = Effect.fn(
  'VersionedAggregateRepo.executeCommands',
)(function* (props: {
  commands: readonly {
    aggregateIndex: number;
    command: string;
    chainedAt: Date;
  }[];
  db: IDb;
  execution: Semaphore.Semaphore;
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: string;
  };
}) {
  if (props.commands.length === 0) return;
  const { db, key } = props;
  const latestAggregate = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: key.aggregateName,
    recordKind: 'aggregates',
  });
  const aggregate = yield* getByKeyOrThrow({
    record: latestAggregate,
    key: key.aggregateVersion,
    recordKind: 'listed versions',
  });

  // 1 — re-read the durable head after acquiring the execution permit
  yield* props.execution.withPermits(1)(
    Effect.gen(function* () {
      const head = db
        .select()
        .from(versionedAggregateRepoDbConfig.schema.head)
        .where(eq(versionedAggregateRepoDbConfig.schema.head.singletonId, 1))
        .get();
      const tail = props.commands.filter(
        row => row.aggregateIndex > (head?.aggregateIndex ?? 0),
      );
      if (tail.length === 0) return;
      const application = yield* Layer.build(Layer.fresh(system.layer));
      const guards = yield* aggregate.initializeGuards.pipe(
        Effect.provideContext(application),
      );

      // 2 — adapt payloads, prepare guards and mutations, and read pinned replica copies
      const preparedPage = yield* Effect.forEach(tail, row =>
        Effect.gen(function* () {
          const source = yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(EncodedAggregateCommandSchema),
          )(row.command).pipe(
            mapParseError({
              code: 'aggregate-admitted-input-invalid',
              prefix: 'Invalid admitted input',
            }),
          );
          const command = yield* Schema.decodeUnknownEffect(
            Schema.toType(AggregateChainedCommandSchema),
          )({
            ...source,
            aggregateIndex: row.aggregateIndex,
            chainedAt: row.chainedAt,
            delta: null,
            failedAt: null,
            failure: null,
            dispositionHash: null,
          }).pipe(
            mapParseError({
              code: 'aggregate-admitted-occurrence-invalid',
              prefix: 'Invalid admitted occurrence',
            }),
          );
          const executionTimestamp = new Date();
          const infrastructure: { failure: IAnyError | null } = {
            failure: null,
          };
          const prepared = yield* Effect.gen(function* () {
            const contractBinding = yield* getByKeyOrThrow({
              record: aggregate.contracts,
              key: command.commandName,
              recordKind: 'aggregate-contract',
            });
            const payload = yield* contractBinding.contract.decodePayload({
              command,
            });
            const made = yield* makeMutations({
              contract: contractBinding.contract,
              models: aggregate.models,
              command: { ...command, payload },
            });
            const captured = yield* getReplicatedResources({
              systemId: key.systemId,
              mutations: made.mutations,
              services: aggregate.services,
              db,
            }).pipe(
              Effect.tapError(error =>
                Effect.sync(() => {
                  if (
                    ![
                      'aggregate-replicated-resource-missing',
                      'replicated-service-resource-not-found',
                    ].includes(error.code)
                  ) {
                    infrastructure.failure = error;
                  }
                }),
              ),
            );
            const mutations = yield* Effect.forEach(
              made.mutations,
              (mutation, mutationIndex) =>
                Effect.gen(function* () {
                  if (mutation.operationName !== 'replicate') {
                    return yield* encodeMutation({
                      commandId: command.id,
                      mutationIndex,
                      mutation,
                    });
                  }
                  const snapshot = captured.find(
                    entry =>
                      entry.modelName === mutation.model.modelName &&
                      entry.resourceId === mutation.resourceId &&
                      entry.operation.serviceName ===
                        mutation.operation.serviceName,
                  );
                  if (snapshot === undefined) {
                    return yield* new ZerospinError({
                      code: 'aggregate-command-chain-replicated-resource-missing',
                      message: `Missing prepared resource ${mutation.model.modelName}.${mutation.resourceId}`,
                    });
                  }
                  const resource = yield* Schema.decodeUnknownEffect(
                    Schema.toType(EncodedResourceSchema),
                  )(snapshot.operation.resource).pipe(
                    mapParseError({
                      code: 'aggregate-replication-resource-invalid',
                      prefix: 'Invalid captured service resource',
                    }),
                  );
                  const prepared = yield* prepareReplayAppliedMutation({
                    controller: aggregate,
                    mutation: {
                      modelName: resource.modelName,
                      modelVersion: resource.version,
                      resourceId: resource.id,
                      operationName: 'replicate',
                      operation: JSON.stringify({
                        serviceName: snapshot.operation.serviceName,
                        serviceVersion: snapshot.operation.serviceVersion,
                        serviceIndex: snapshot.operation.serviceIndex,
                        resource: {
                          ...resource,
                          deletedAt: resource.deletedAt ?? null,
                        },
                      }),
                    },
                  });
                  if (prepared === null) return null;
                  if (prepared.operationName !== 'replicate') {
                    return yield* new ZerospinError({
                      code: 'replica-source-mutation-invalid',
                      message:
                        'Replica initialization must produce a replica resource mutation',
                    });
                  }
                  return yield* encodeMutation({
                    commandId: command.id,
                    mutationIndex,
                    mutation: {
                      ...prepared,
                      operation: {
                        ...prepared.operation,
                        serviceName: snapshot.operation.serviceName,
                        serviceVersion: snapshot.operation.serviceVersion,
                        serviceIndex: snapshot.operation.serviceIndex,
                      },
                    },
                  });
                }),
            );

            return {
              mutations: mutations.filter(mutation => mutation !== null),
              executionInput: {
                payload: made.payload,
              },
            };
          }).pipe(Effect.result);
          if (infrastructure.failure !== null) {
            return yield* infrastructure.failure;
          }
          return {
            entry: {
              sourceCommand: row.command,
              command,
              executionTimestamp,
              preparationVersion: key.aggregateVersion,
              mutations: Result.isSuccess(prepared)
                ? prepared.success.mutations
                : [],
            },
            executionInput: Result.isSuccess(prepared)
              ? prepared.success.executionInput
              : null,
            failure: Result.isFailure(prepared) ? prepared.failure : null,
          };
        }),
      ).pipe(
        Effect.provideContext(guards.context),
        Effect.provideContext(application),
      );

      // 3 — execute the prepared page and atomically commit its terminal results
      yield* executeCommandsTx({
        head,
        preparedPage,
        aggregate,
        guards,
        key,
      }).pipe(
        Effect.provideService(VersionedAggregateRepoDb, db),
        Effect.provideContext(guards.context),
        Effect.provideContext(application),
      );
    }),
  );
}, Effect.scoped);
