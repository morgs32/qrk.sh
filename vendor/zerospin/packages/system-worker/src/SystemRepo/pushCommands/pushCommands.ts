import type { IUserRef } from '@zerospin/core/aggregate/types';
import type { Async } from '@zerospin/core/async/Async';
import type {
  IEncodedCommand,
  IPushBlock,
  IStagedReplicaCommand,
} from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import type { AnyColumn } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { drainSystemWrites } from '../drainSystemWrites/drainSystemWrites.js';
import {
  PushCommandsSystemWriteCommandsSchema,
  PushCommandsSystemWriteResultSchema,
  PushCommandsSystemWriteTargetSchema,
} from '../systemWriteSchemas.js';

export const pushCommands = Effect.fn('SystemRepo.pushCommands')(
  function* (props: {
    db: IDb;
    actorRef: IUserRef;
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
    commands: readonly IEncodedCommand<IStagedReplicaCommand>[];
    deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
    generationStateTable: IAnyDrizzleSchema;
    generationStateColumns: Readonly<{
      generationId: AnyColumn;
      lastWriteIndex: AnyColumn;
      phase: AnyColumn;
    }>;
    interruptSystemWriteCapture: boolean;
    selectionTable: IAnyDrizzleSchema;
    selectionColumns: Readonly<{
      id: AnyColumn;
      lastWriteIndex: AnyColumn;
      writeGenerationId: AnyColumn;
    }>;
    storage: DurableObjectStorage;
    systemWriteTable: IAnyDrizzleSchema;
    systemWriteColumns: Readonly<{
      deliveryAttemptCount: AnyColumn;
      generationId: AnyColumn;
      result: AnyColumn;
      writeIndex: AnyColumn;
    }>;
    targetGenerationId?: string;
  }): Effect.fn.Return<IPushBlock, IAnyError, Async> {
    const target = {
      aggregateId: props.actorRef.aggregateId,
      aggregateName: props.actorRef.aggregateName,
      userId: props.actorRef.userId,
      frontendName: props.frontendName,
      aggregateFrontendLock: props.aggregateFrontendLock,
    };
    const encodedTarget = yield* Schema.encode(
      Schema.parseJson(PushCommandsSystemWriteTargetSchema),
    )(target).pipe(
      mapParseError({
        code: 'system-write-push-target-encode-failed',
        prefix: 'Failed to encode the complete pushCommands target',
      }),
    );
    const encodedCommands = yield* Schema.encode(
      Schema.parseJson(PushCommandsSystemWriteCommandsSchema),
    )(props.commands).pipe(
      mapParseError({
        code: 'system-write-push-commands-encode-failed',
        prefix: 'Failed to encode the complete pushCommands request',
      }),
    );

    return yield* Effect.uninterruptibleMask(restore =>
      Effect.gen(function* () {
        const accepted = yield* Effect.try({
          try: () =>
            props.db.transaction(tx => {
              const selections = tx
                .select({
                  id: props.selectionColumns.id,
                  lastWriteIndex: props.selectionColumns.lastWriteIndex,
                  writeGenerationId: props.selectionColumns.writeGenerationId,
                })
                .from(props.selectionTable)
                .all();
              if (selections.length !== 1) {
                throw new ZerospinError({
                  code: 'system-write-selection-invalid',
                  message: 'SystemRepo requires exactly one selection row',
                  extra: { selectionCount: selections.length },
                });
              }
              const selection = selections[0];
              const selectedGenerationId =
                props.targetGenerationId ?? selection?.writeGenerationId;
              if (
                selectedGenerationId === null ||
                selectedGenerationId === undefined
              ) {
                throw new ZerospinError({
                  code: 'generation-not-prepared',
                  message: 'No writable generation is selected',
                  extra: { operationName: 'pushCommands', mode: 'write' },
                });
              }
              const generationId = Schema.decodeUnknownSync(Schema.String)(
                selectedGenerationId,
              );
              const generation = tx
                .select({ phase: props.generationStateColumns.phase })
                .from(props.generationStateTable)
                .where(
                  eq(props.generationStateColumns.generationId, generationId),
                )
                .get();
              if (generation === undefined) {
                throw new ZerospinError({
                  code: 'generation-state-missing',
                  message: 'The SystemRepo write generation does not exist',
                  extra: { generationId, operationName: 'pushCommands' },
                });
              }
              const phase = Schema.decodeUnknownSync(
                Schema.Literal(
                  'closed',
                  'migrating',
                  'open',
                  'draining',
                  'retired',
                ),
              )(generation.phase);
              const targeted = props.targetGenerationId !== undefined;
              if (
                (targeted &&
                  phase !== 'closed' &&
                  phase !== 'migrating' &&
                  phase !== 'open') ||
                (!targeted && phase !== 'migrating' && phase !== 'open')
              ) {
                throw new ZerospinError({
                  code: 'generation-write-admission-closed',
                  message: 'Write admission is closed for this generation',
                  extra: { generationId, operationName: 'pushCommands', phase },
                });
              }
              const lastWriteIndex = Schema.decodeUnknownSync(
                Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
              )(selection?.lastWriteIndex);
              const writeIndex = lastWriteIndex + 1;
              if (!Number.isSafeInteger(writeIndex)) {
                throw new ZerospinError({
                  code: 'system-write-index-exhausted',
                  message: 'SystemRepo write index exhausted',
                  extra: { lastWriteIndex },
                });
              }
              const createdAt = new Date();
              tx.update(props.selectionTable)
                .set({ lastWriteIndex: writeIndex })
                .where(eq(props.selectionColumns.id, selection?.id))
                .run();
              tx.update(props.generationStateTable)
                .set({ lastWriteIndex: writeIndex })
                .where(
                  eq(props.generationStateColumns.generationId, generationId),
                )
                .run();
              tx.insert(props.systemWriteTable)
                .values({
                  writeIndex,
                  generationId,
                  operation: 'pushCommands',
                  target: encodedTarget,
                  commands: encodedCommands,
                  result: null,
                  deliveryAttemptCount: 0,
                  lastDeliveryFailure: null,
                  createdAt,
                  lastDeliveryAttemptAt: null,
                  resolvedAt: null,
                })
                .run();
              return { generationId, writeIndex, targeted };
            }),
          catch: error =>
            ZerospinError.isZerospinError(error)
              ? error
              : new ZerospinError({
                  code: 'system-write-acceptance-failed',
                  message: 'Failed to atomically accept pushCommands',
                  cause: ZerospinError.prettyUnknownFailure(error),
                  extra: { operationName: 'pushCommands' },
                }),
        });

        yield* Effect.promise(() => props.storage.setAlarm(Date.now() + 250));

        return yield* restore(
          Effect.gen(function* () {
            yield* drainSystemWrites({
              db: props.db,
              deliveryQueue: props.deliveryQueue,
              generationId: accepted.generationId,
              generationStateTable: props.generationStateTable,
              generationStateColumns: props.generationStateColumns,
              ...(accepted.targeted ? { includeHeld: true } : {}),
              interruptSystemWriteCapture: props.interruptSystemWriteCapture,
              storage: props.storage,
              systemWriteTable: props.systemWriteTable,
              systemWriteColumns: props.systemWriteColumns,
              throughWriteIndex: accepted.writeIndex,
            });
            const row = yield* Effect.try({
              try: () =>
                props.db
                  .select({ result: props.systemWriteColumns.result })
                  .from(props.systemWriteTable)
                  .where(
                    eq(
                      props.systemWriteColumns.writeIndex,
                      accepted.writeIndex,
                    ),
                  )
                  .get(),
              catch: ZerospinError.catch({
                code: 'system-write-result-read-failed',
                message: 'Failed to read terminal pushCommands result',
                extra: { writeIndex: accepted.writeIndex },
              }),
            });
            if (row === undefined || row.result === null) {
              return yield* new ZerospinError({
                code: 'system-write-result-missing',
                message: 'Terminal pushCommands result is missing',
                extra: { writeIndex: accepted.writeIndex },
              });
            }
            const terminal = yield* Schema.decodeUnknown(
              Schema.parseJson(PushCommandsSystemWriteResultSchema),
            )(row.result).pipe(
              mapParseError({
                code: 'system-write-push-result-invalid',
                prefix: 'Stored terminal pushCommands result is invalid',
                extra: { writeIndex: accepted.writeIndex },
              }),
            );
            if (Either.isLeft(terminal)) {
              return yield* terminal.left;
            }
            return terminal.right;
          }),
        );
      }),
    );
  },
);
