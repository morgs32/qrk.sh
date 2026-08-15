import type { Async } from '@zerospin/core/async/Async';
import type {
  IEncodedCommand,
  IExecutedServiceCommand,
  IFailedServiceCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { drainSystemWrites } from '../drainSystemWrites/drainSystemWrites.js';
import {
  FinalizeServiceCommandsSystemWriteCommandsSchema,
  FinalizeServiceCommandsSystemWriteResultSchema,
  FinalizeServiceCommandsSystemWriteTargetSchema,
} from '../systemWriteSchemas.js';

export const finalizeServiceCommands = Effect.fn(
  'SystemRepo.finalizeServiceCommands',
)(function* (props: {
  db: IDb;
  serviceName: string;
  commands: readonly IEncodedCommand<IServiceCommand>[];
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
}): Effect.fn.Return<
  Readonly<{
    executedCommands: readonly IEncodedCommand<IExecutedServiceCommand>[];
    failedCommands: readonly IEncodedCommand<IFailedServiceCommand>[];
  }>,
  IAnyError,
  Async
> {
  const target = { serviceName: props.serviceName };
  const encodedTarget = yield* Schema.encode(
    Schema.parseJson(FinalizeServiceCommandsSystemWriteTargetSchema),
  )(target).pipe(
    mapParseError({
      code: 'system-write-service-target-encode-failed',
      prefix: 'Failed to encode the complete finalizeServiceCommands target',
    }),
  );
  const encodedCommands = yield* Schema.encode(
    Schema.parseJson(FinalizeServiceCommandsSystemWriteCommandsSchema),
  )(props.commands).pipe(
    mapParseError({
      code: 'system-write-service-commands-encode-failed',
      prefix: 'Failed to encode the complete finalizeServiceCommands request',
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
                extra: {
                  operationName: 'finalizeServiceCommands',
                  mode: 'write',
                },
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
                extra: {
                  generationId,
                  operationName: 'finalizeServiceCommands',
                },
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
                extra: {
                  generationId,
                  operationName: 'finalizeServiceCommands',
                  phase,
                },
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
                operation: 'finalizeServiceCommands',
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
                message: 'Failed to atomically accept finalizeServiceCommands',
                cause: ZerospinError.prettyUnknownFailure(error),
                extra: { operationName: 'finalizeServiceCommands' },
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
                  eq(props.systemWriteColumns.writeIndex, accepted.writeIndex),
                )
                .get(),
            catch: ZerospinError.catch({
              code: 'system-write-result-read-failed',
              message: 'Failed to read terminal finalizeServiceCommands result',
              extra: { writeIndex: accepted.writeIndex },
            }),
          });
          if (row === undefined || row.result === null) {
            return yield* new ZerospinError({
              code: 'system-write-result-missing',
              message: 'Terminal finalizeServiceCommands result is missing',
              extra: { writeIndex: accepted.writeIndex },
            });
          }
          const terminal = yield* Schema.decodeUnknown(
            Schema.parseJson(FinalizeServiceCommandsSystemWriteResultSchema),
          )(row.result).pipe(
            mapParseError({
              code: 'system-write-service-result-invalid',
              prefix:
                'Stored terminal finalizeServiceCommands result is invalid',
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
});
