import type { Async } from '@zerospin/core/async/Async';
import { applyAggregateFrontendMutationTx } from '@zerospin/core/contracts/applyAggregateFrontendMutationTx';
import {
  PushBlockSchema,
  StagedReplicaCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { encodeAppliedMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import type {
  IAnyMutation,
  IEncodedCommand,
  IExecutedPushedCommand,
  IFailedPushedCommand,
  IFailedStagedReplicaCommand,
  IFinalizedFailedStagedReplicaCommand,
  IPushBlock,
  IPushedCommand,
  IStagedReplicaCommand,
} from '@zerospin/core/contracts/types';
import { makeAsyncTx } from '@zerospin/core/drizzle/makeAsyncTx';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAnyDrizzleSchemas, IModel } from '@zerospin/core/models/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { dutils } from '@zerospin/core/utils/dutils';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { makeCursor } from '@zerospin/core/utils/makeCursor';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';
import { system } from 'system';

import { getLastAggregateCursor } from '../../getLastAggregateCursor/getLastAggregateCursor.js';
import { validateAggregateFrontendLock } from '../../StaticSystem/validateAggregateFrontendLock/validateAggregateFrontendLock.js';
import { aggregateFrontendRepoDrizzleSchemas } from '../AggregateFrontendRepo.js';
import { getState } from '../getState/getState.js';
import { prepareAggregateFrontendCommand } from '../prepareAggregateFrontendCommand/prepareAggregateFrontendCommand.js';

/*
 * 1. Validate the exact target, lock, stable request bytes, and supplied replica order.
 * 2. Return an exact retained receipt for same-write redelivery before any mutation.
 * 3. Classify canonical command outcomes and admit each unseen command in its own savepoint.
 * 4. Persist one five-partition PushBlock receipt keyed by writeIndex.
 * 5. Finalize retained-only receipts locally; deliver only first-seen pushed or failed-staged work.
 */
export const pushCommands = Effect.fn('AggregateFrontendRepo.pushCommands')(
  function* (props: {
    writeIndex: number;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
    commands: readonly IEncodedCommand<IStagedReplicaCommand>[];
    key: {
      generationId: string;
      aggregateId: string;
      aggregateName: string;
      userId: string;
      frontendName: string;
    };
    configuredSystemId: string;
    db: IDb;
    aggregateFrontendRepoSchema: IAnyDrizzleSchemas &
      Record<`aggregateSource_${string}`, IModel['drizzleSchema']>;
    name: string;
    storage: DurableObjectStorage;
  }): Effect.fn.Return<
    IPushBlock,
    IAnyError,
    Async | CuidFactory | MonotonicFactory
  > {
    const { commands, db, key, storage, writeIndex } = props;

    // 1 — request validation is complete before receipt lookup or state mutation.
    if (!Number.isSafeInteger(writeIndex) || writeIndex < 1) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-push-write-index-invalid',
        message: `Aggregate frontend push writeIndex must be a positive safe integer, received ${writeIndex}`,
      });
    }
    if (
      props.aggregateId !== key.aggregateId ||
      props.aggregateName !== key.aggregateName ||
      props.userId !== key.userId ||
      props.frontendName !== key.frontendName
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-push-request-key-mismatch',
        message:
          'pushCommands request scope does not match this AggregateFrontendRepo',
      });
    }
    yield* validateAggregateFrontendLock({
      aggregateName: props.aggregateName,
      frontendName: props.frontendName,
      aggregateFrontendLock: props.aggregateFrontendLock,
    });
    const aggregate = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: key.aggregateName,
      recordKind: 'aggregates',
    });
    const frontendBinding = yield* getByKeyOrThrow({
      record: aggregate.frontends,
      key: key.frontendName,
      recordKind: `frontends owned by aggregate ${key.aggregateName}`,
    });
    const seenCommandIds = new Set<string>();
    const seenReplicaIndices = new Set<number>();
    let previousReplicaIndex = 0;
    for (const command of commands) {
      yield* Schema.validate(StagedReplicaCommandSchema)(command, {
        onExcessProperty: 'error',
      }).pipe(
        mapParseError({
          code: 'aggregate-frontend-staged-replica-command-invalid',
          prefix: `Failed to validate staged replica command ${command.id}`,
        }),
      );
      if (
        command.aggregateId !== key.aggregateId ||
        command.aggregateName !== key.aggregateName ||
        command.userId !== key.userId ||
        command.frontendName !== key.frontendName
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-push-command-key-mismatch',
          message: `Staged command "${command.id}" does not match this AggregateFrontendRepo key`,
        });
      }
      if (command.systemName !== frontendBinding.controller.systemName) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-push-command-system-mismatch',
          message: `Staged command "${command.id}" targets system "${command.systemName}", not "${frontendBinding.controller.systemName}"`,
        });
      }
      if (command.pushedCursor !== null) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-push-staged-command-has-pushed-cursor',
          message: `Staged command "${command.id}" already has a pushed cursor`,
        });
      }
      if (seenCommandIds.has(command.id)) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-push-command-id-duplicate',
          message: `Command "${command.id}" appears more than once in one push request`,
        });
      }
      if (
        seenReplicaIndices.has(command.replicaIndex) ||
        command.replicaIndex <= previousReplicaIndex
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-push-replica-order-invalid',
          message:
            'Push command replicaIndex values must be unique and strictly increasing in supplied order',
        });
      }
      seenCommandIds.add(command.id);
      seenReplicaIndices.add(command.replicaIndex);
      previousReplicaIndex = command.replicaIndex;
    }

    const requestBytes = yield* Schema.encode(
      Schema.parseJson(
        Schema.Struct({
          writeIndex: Schema.Number.pipe(Schema.int(), Schema.positive()),
          aggregateId: Schema.String,
          aggregateName: Schema.String,
          userId: Schema.String,
          frontendName: Schema.String,
          aggregateFrontendLock: AggregateFrontendLockSchema,
          commands: Schema.Array(StagedReplicaCommandSchema),
        }),
      ),
    )({
      writeIndex,
      aggregateId: props.aggregateId,
      aggregateName: props.aggregateName,
      userId: props.userId,
      frontendName: props.frontendName,
      aggregateFrontendLock: props.aggregateFrontendLock,
      commands,
    }).pipe(
      mapParseError({
        code: 'aggregate-frontend-push-request-encode-failed',
        prefix: 'Failed to encode aggregate frontend push request bytes',
      }),
    );

    // 2 — a same-write retry is an exact immutable receipt read.
    const retainedReceipt = db
      .select()
      .from(aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox)
      .where(
        eq(
          aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox.writeIndex,
          writeIndex,
        ),
      )
      .get();
    if (retainedReceipt !== undefined) {
      if (retainedReceipt.requestBytes !== requestBytes) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-push-write-conflict',
          message: `Push write ${writeIndex} conflicts with its retained request bytes`,
        });
      }
      return yield* Schema.decodeUnknown(Schema.parseJson(PushBlockSchema))(
        retainedReceipt.block,
      ).pipe(
        mapParseError({
          code: 'aggregate-frontend-push-receipt-decode-failed',
          prefix: `Failed to decode retained PushBlock ${writeIndex}`,
        }),
      );
    }

    if (
      storage.kv.get('initialized') !== true ||
      storage.kv.get('emissionMode') !== 'live' ||
      storage.kv.get('subscribed') !== true
    ) {
      yield* getState({
        aggregateId: props.aggregateId,
        aggregateName: props.aggregateName,
        userId: props.userId,
        frontendName: props.frontendName,
        configuredSystemId: props.configuredSystemId,
        key,
        name: props.name,
        db,
        aggregateFrontendRepoSchema: props.aggregateFrontendRepoSchema,
        storage,
        lineage: { predecessor: null },
      });
    }

    return yield* makeAsyncTx({
      storage,
      program: Effect.fn('AggregateFrontendRepo.pushCommands.transaction')(
        function* () {
          const guardedAtAggregateCursor =
            (yield* getLastAggregateCursor({ storage })) ?? null;
          const preparations = new Map<
            string,
            Either.Either<
              Readonly<{
                encodedPayload: string;
                mutations: readonly IAnyMutation[];
              }>,
              IAnyError
            >
          >();
          for (const stagedCommand of commands) {
            const hasCanonicalOutcome =
              db
                .select()
                .from(aggregateFrontendRepoDrizzleSchemas.pushedCommands)
                .where(
                  eq(
                    aggregateFrontendRepoDrizzleSchemas.pushedCommands.id,
                    stagedCommand.id,
                  ),
                )
                .get() !== undefined ||
              db
                .select()
                .from(
                  aggregateFrontendRepoDrizzleSchemas.executedPushedCommands,
                )
                .where(
                  eq(
                    aggregateFrontendRepoDrizzleSchemas.executedPushedCommands
                      .id,
                    stagedCommand.id,
                  ),
                )
                .get() !== undefined ||
              db
                .select()
                .from(aggregateFrontendRepoDrizzleSchemas.failedStagedCommands)
                .where(
                  eq(
                    aggregateFrontendRepoDrizzleSchemas.failedStagedCommands.id,
                    stagedCommand.id,
                  ),
                )
                .get() !== undefined ||
              db
                .select()
                .from(aggregateFrontendRepoDrizzleSchemas.failedPushedCommands)
                .where(
                  eq(
                    aggregateFrontendRepoDrizzleSchemas.failedPushedCommands.id,
                    stagedCommand.id,
                  ),
                )
                .get() !== undefined;
            if (!hasCanonicalOutcome) {
              preparations.set(
                stagedCommand.id,
                yield* prepareAggregateFrontendCommand({
                  db,
                  command: stagedCommand,
                }).pipe(Effect.either),
              );
            }
          }

          return yield* makeTx({
            db,
            program: Effect.fn(
              'AggregateFrontendRepo.pushCommands.sqliteTransaction',
            )(function* ({ tx }) {
              const pendingCommands: IEncodedCommand<IPushedCommand>[] = [];
              const pushedCommands: IEncodedCommand<IPushedCommand>[] = [];
              const executedCommands: IEncodedCommand<IExecutedPushedCommand>[] =
                [];
              const failedStagedCommands: Array<
                | IEncodedCommand<IFailedStagedReplicaCommand>
                | IEncodedCommand<IFinalizedFailedStagedReplicaCommand>
              > = [];
              const failedPushedCommands: IEncodedCommand<IFailedPushedCommand>[] =
                [];

              // 3 — every requested command resolves to one canonical partition.
              for (const stagedCommand of commands) {
                const encodedIncoming = Schema.encodeUnknownSync(
                  Schema.parseJson(StagedReplicaCommandSchema),
                )(stagedCommand, { onExcessProperty: 'error' });
                const pushedRow = tx
                  .select()
                  .from(aggregateFrontendRepoDrizzleSchemas.pushedCommands)
                  .where(
                    eq(
                      aggregateFrontendRepoDrizzleSchemas.pushedCommands.id,
                      stagedCommand.id,
                    ),
                  )
                  .get();
                const executedRow = tx
                  .select()
                  .from(
                    aggregateFrontendRepoDrizzleSchemas.executedPushedCommands,
                  )
                  .where(
                    eq(
                      aggregateFrontendRepoDrizzleSchemas.executedPushedCommands
                        .id,
                      stagedCommand.id,
                    ),
                  )
                  .get();
                const failedStagedRow = tx
                  .select()
                  .from(
                    aggregateFrontendRepoDrizzleSchemas.failedStagedCommands,
                  )
                  .where(
                    eq(
                      aggregateFrontendRepoDrizzleSchemas.failedStagedCommands
                        .id,
                      stagedCommand.id,
                    ),
                  )
                  .get();
                const failedPushedRow = tx
                  .select()
                  .from(
                    aggregateFrontendRepoDrizzleSchemas.failedPushedCommands,
                  )
                  .where(
                    eq(
                      aggregateFrontendRepoDrizzleSchemas.failedPushedCommands
                        .id,
                      stagedCommand.id,
                    ),
                  )
                  .get();
                const lifecycleCount =
                  Number(pushedRow !== undefined) +
                  Number(executedRow !== undefined) +
                  Number(failedStagedRow !== undefined) +
                  Number(failedPushedRow !== undefined);
                if (lifecycleCount > 1) {
                  return yield* new ZerospinError({
                    code: 'aggregate-frontend-push-command-lifecycle-conflict',
                    message: `Command "${stagedCommand.id}" resolves to multiple canonical lifecycle rows`,
                  });
                }

                let persistedStagedBytes: string | undefined;
                if (pushedRow !== undefined) {
                  const {
                    pushedAt: _pushedAt,
                    pushedCursor: _pushedCursor,
                    status: _status,
                    ...stagedFields
                  } = pushedRow;
                  persistedStagedBytes = Schema.encodeUnknownSync(
                    Schema.parseJson(StagedReplicaCommandSchema),
                  )(
                    { ...stagedFields, pushedCursor: null, status: 'staged' },
                    {
                      onExcessProperty: 'error',
                    },
                  );
                } else if (executedRow !== undefined) {
                  const {
                    pushedAt: _pushedAt,
                    pushedCursor: _pushedCursor,
                    mode: _mode,
                    aggregateCursor: _aggregateCursor,
                    aggregateIndex: _aggregateIndex,
                    executedAt: _executedAt,
                    status: _status,
                    ...stagedFields
                  } = executedRow;
                  persistedStagedBytes = Schema.encodeUnknownSync(
                    Schema.parseJson(StagedReplicaCommandSchema),
                  )(
                    { ...stagedFields, pushedCursor: null, status: 'staged' },
                    {
                      onExcessProperty: 'error',
                    },
                  );
                } else if (failedStagedRow !== undefined) {
                  const {
                    aggregateCursor: _aggregateCursor,
                    aggregateIndex: _aggregateIndex,
                    failedAt: _failedAt,
                    failure: _failure,
                    status: _status,
                    ...stagedFields
                  } = failedStagedRow;
                  persistedStagedBytes = Schema.encodeUnknownSync(
                    Schema.parseJson(StagedReplicaCommandSchema),
                  )(
                    { ...stagedFields, status: 'staged' },
                    {
                      onExcessProperty: 'error',
                    },
                  );
                } else if (failedPushedRow !== undefined) {
                  const {
                    pushedAt: _pushedAt,
                    pushedCursor: _pushedCursor,
                    aggregateCursor: _aggregateCursor,
                    aggregateIndex: _aggregateIndex,
                    failedAt: _failedAt,
                    failure: _failure,
                    status: _status,
                    ...stagedFields
                  } = failedPushedRow;
                  persistedStagedBytes = Schema.encodeUnknownSync(
                    Schema.parseJson(StagedReplicaCommandSchema),
                  )(
                    { ...stagedFields, pushedCursor: null, status: 'staged' },
                    {
                      onExcessProperty: 'error',
                    },
                  );
                }
                if (
                  persistedStagedBytes !== undefined &&
                  persistedStagedBytes !== encodedIncoming
                ) {
                  return yield* new ZerospinError({
                    code: 'aggregate-frontend-push-command-byte-conflict',
                    message: `Command "${stagedCommand.id}" conflicts with its retained command bytes`,
                  });
                }
                if (pushedRow !== undefined) {
                  pendingCommands.push(pushedRow);
                  continue;
                }
                if (executedRow !== undefined) {
                  executedCommands.push(executedRow);
                  continue;
                }
                if (failedStagedRow !== undefined) {
                  if (
                    failedStagedRow.aggregateCursor === null ||
                    failedStagedRow.aggregateIndex === null
                  ) {
                    const {
                      aggregateCursor,
                      aggregateIndex,
                      ...failedStagedCommand
                    } = failedStagedRow;
                    failedStagedCommands.push(failedStagedCommand);
                  } else {
                    failedStagedCommands.push(failedStagedRow);
                  }
                  continue;
                }
                if (failedPushedRow !== undefined) {
                  failedPushedCommands.push(failedPushedRow);
                  continue;
                }

                const prepared = preparations.get(stagedCommand.id);
                if (prepared === undefined) {
                  return yield* new ZerospinError({
                    code: 'aggregate-frontend-push-preparation-missing',
                    message: `Command "${stagedCommand.id}" has neither a canonical outcome nor a prepared admission`,
                  });
                }
                const admitted = Either.isLeft(prepared)
                  ? Either.left(prepared.left)
                  : yield* withSavepoint({
                      tx,
                      program: Effect.fn(
                        'AggregateFrontendRepo.pushCommands.commandSavepoint',
                      )(function* ({ tx: savepointTx }) {
                        const pushedAt = yield* dutils.date();
                        const pushedCursor = yield* makeCursor({
                          abbreviation: coreAbbreviations.pushedCursor,
                        });
                        const pushedCommand = {
                          ...stagedCommand,
                          pushedAt,
                          pushedCursor,
                          status: 'pushed',
                        } satisfies IEncodedCommand<IPushedCommand>;
                        savepointTx
                          .insert(
                            aggregateFrontendRepoDrizzleSchemas.pushedCommands,
                          )
                          .values(pushedCommand)
                          .run();
                        for (const [
                          mutationIndex,
                          mutation,
                        ] of prepared.right.mutations.entries()) {
                          const appliedMutation =
                            yield* applyAggregateFrontendMutationTx({
                              tx: savepointTx,
                              mutation,
                              commandId: stagedCommand.id,
                              mutationIndex,
                              appliedAt: pushedAt,
                            });
                          savepointTx
                            .insert(
                              aggregateFrontendRepoDrizzleSchemas.pushedMutations,
                            )
                            .values(
                              yield* encodeAppliedMutation({
                                mutation: appliedMutation,
                              }),
                            )
                            .run();
                        }
                        return pushedCommand;
                      }),
                    }).pipe(Effect.either);

                if (Either.isRight(admitted)) {
                  pushedCommands.push(admitted.right);
                  continue;
                }

                const failedAt = yield* dutils.date();
                const failedCommand = {
                  ...stagedCommand,
                  failedAt,
                  failure: ZerospinError.stringify(admitted.left),
                  status: 'failed',
                } satisfies IEncodedCommand<IFailedStagedReplicaCommand>;
                tx.insert(
                  aggregateFrontendRepoDrizzleSchemas.failedStagedCommands,
                )
                  .values({
                    ...failedCommand,
                    aggregateCursor: null,
                    aggregateIndex: null,
                  })
                  .run();
                failedStagedCommands.push(failedCommand);
              }

              const pushBlock = {
                writeIndex,
                guardedAtAggregateCursor,
                pendingCommands,
                pushedCommands,
                executedCommands,
                failedStagedCommands,
                failedPushedCommands,
              } satisfies IPushBlock;
              const encodedPushBlock = yield* Schema.encode(
                Schema.parseJson(PushBlockSchema),
              )(pushBlock).pipe(
                mapParseError({
                  code: 'aggregate-frontend-push-block-encode-failed',
                  prefix: 'Failed to encode AggregateFrontendRepo PushBlock',
                }),
              );
              tx.insert(aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox)
                .values({
                  writeIndex,
                  requestBytes,
                  block: encodedPushBlock,
                  finalizedAt:
                    pushedCommands.length === 0 &&
                    failedStagedCommands.every(
                      command => 'aggregateIndex' in command,
                    )
                      ? new Date()
                      : null,
                  failure: null,
                })
                .run();
              return pushBlock;
            }),
          });
        },
      ),
    });
  },
);
