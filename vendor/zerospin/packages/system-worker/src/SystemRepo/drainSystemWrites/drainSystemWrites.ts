import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { PushBlockSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, asc, eq, isNull, lte, type AnyColumn } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';

import { getAggregateFrontendRepo } from '../../AggregateFrontendRepo/getAggregateFrontendRepo/getAggregateFrontendRepo.js';
import { getAggregateRepo } from '../../AggregateRepo/getAggregateRepo/getAggregateRepo.js';
import {
  AggregateFinalizationReceiptSchema,
  ServiceFinalizationReceiptSchema,
} from '../../blockSchemas.js';
import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { makeOutboxQueue } from '../../makeOutboxQueue/makeOutboxQueue.js';
import { getServiceRepo } from '../../ServiceRepo/getServiceRepo/getServiceRepo.js';
import {
  FinalizeAggregateCommandsSystemWriteCommandsSchema,
  FinalizeAggregateCommandsSystemWriteResultSchema,
  FinalizeAggregateCommandsSystemWriteTargetSchema,
  FinalizeServiceCommandsSystemWriteCommandsSchema,
  FinalizeServiceCommandsSystemWriteResultSchema,
  FinalizeServiceCommandsSystemWriteTargetSchema,
  PushCommandsSystemWriteCommandsSchema,
  PushCommandsSystemWriteResultSchema,
  PushCommandsSystemWriteTargetSchema,
} from '../systemWriteSchemas.js';

const StoredSystemWriteSchema = Schema.Struct({
  writeIndex: Schema.Number.pipe(Schema.int(), Schema.positive()),
  generationId: Schema.String,
  operation: Schema.Literal(
    'pushCommands',
    'finalizeAggregateCommands',
    'finalizeServiceCommands',
  ),
  target: Schema.String,
  commands: Schema.String,
  result: Schema.NullOr(Schema.String),
  deliveryAttemptCount: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  lastDeliveryFailure: Schema.NullOr(Schema.String),
  createdAt: Schema.DateFromSelf,
  lastDeliveryAttemptAt: Schema.NullOr(Schema.DateFromSelf),
  resolvedAt: Schema.NullOr(Schema.DateFromSelf),
});

const StoredGenerationPhaseSchema = Schema.Struct({
  generationId: Schema.String,
  phase: Schema.Literal('closed', 'migrating', 'open', 'draining', 'retired'),
});

export const drainSystemWrites = Effect.fn('SystemRepo.drainSystemWrites')(
  function* (props: {
    alarm?: true;
    db: IDb;
    deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
    generationId?: string;
    generationStateTable: IAnyDrizzleSchema;
    generationStateColumns: Readonly<{
      generationId: AnyColumn;
      phase: AnyColumn;
    }>;
    includeHeld?: true;
    interruptSystemWriteCapture: boolean;
    storage: DurableObjectStorage;
    systemWriteTable: IAnyDrizzleSchema;
    systemWriteColumns: Readonly<{
      writeIndex: AnyColumn;
      generationId: AnyColumn;
      deliveryAttemptCount: AnyColumn;
      result: AnyColumn;
    }>;
    throughWriteIndex: number | null;
    waitForTerminal?: false;
  }): Effect.fn.Return<void, IAnyError, Async> {
    const readMatchingRows = Effect.fn(
      'SystemRepo.drainSystemWrites.readMatchingRows',
    )(function* (readProps?: { includeHeld: boolean }) {
      const predicates = [isNull(props.systemWriteColumns.result)];
      if (props.generationId !== undefined) {
        predicates.push(
          eq(props.systemWriteColumns.generationId, props.generationId),
        );
      }
      if (props.throughWriteIndex !== null) {
        predicates.push(
          lte(props.systemWriteColumns.writeIndex, props.throughWriteIndex),
        );
      }

      const rawRows = yield* Effect.try({
        try: () =>
          props.db
            .select()
            .from(props.systemWriteTable)
            .where(and(...predicates))
            .orderBy(asc(props.systemWriteColumns.writeIndex))
            .all(),
        catch: ZerospinError.catch({
          code: 'system-write-pending-read-failed',
          message: 'Failed to read pending SystemRepo writes',
          extra: {
            generationId: props.generationId ?? null,
            throughWriteIndex: props.throughWriteIndex,
          },
        }),
      });
      const rows = yield* Schema.decodeUnknown(
        Schema.Array(StoredSystemWriteSchema),
      )(rawRows).pipe(
        mapParseError({
          code: 'system-write-row-invalid',
          prefix: 'Stored SystemRepo write row is invalid',
        }),
      );
      if (
        readProps?.includeHeld === true ||
        props.includeHeld === true ||
        rows.length === 0
      ) {
        return rows;
      }

      const rawPhases = yield* Effect.try({
        try: () =>
          props.db
            .select({
              generationId: props.generationStateColumns.generationId,
              phase: props.generationStateColumns.phase,
            })
            .from(props.generationStateTable)
            .all(),
        catch: ZerospinError.catch({
          code: 'system-write-generation-phase-read-failed',
          message: 'Failed to read SystemRepo write-generation phases',
        }),
      });
      const phases = yield* Schema.decodeUnknown(
        Schema.Array(StoredGenerationPhaseSchema),
      )(rawPhases).pipe(
        mapParseError({
          code: 'system-write-generation-phase-invalid',
          prefix: 'Stored SystemRepo write-generation phase is invalid',
        }),
      );
      const phaseByGenerationId = new Map(
        phases.map(row => [row.generationId, row.phase]),
      );
      return rows.filter(row => {
        const phase = phaseByGenerationId.get(row.generationId);
        return phase === 'open' || phase === 'draining';
      });
    });

    const lane = makeOutboxQueue({
      deliveryQueue: props.deliveryQueue,
      name: 'SystemRepo.systemWrites',
      readPending: () =>
        Effect.gen(function* () {
          const rows = yield* readMatchingRows();
          return yield* Effect.forEach(rows, row =>
            Effect.gen(function* () {
              switch (row.operation) {
                case 'pushCommands': {
                  const target = yield* Schema.decodeUnknown(
                    Schema.parseJson(PushCommandsSystemWriteTargetSchema),
                  )(row.target).pipe(
                    mapParseError({
                      code: 'system-write-push-target-invalid',
                      prefix: 'Stored pushCommands target is invalid',
                      extra: { writeIndex: row.writeIndex },
                    }),
                  );
                  return {
                    row,
                    target,
                    operation: row.operation,
                    targetKey: [
                      row.generationId,
                      'AggregateFrontendRepo',
                      target.aggregateId,
                      target.aggregateName,
                      target.userId,
                      target.frontendName,
                    ].join('/'),
                  };
                }
                case 'finalizeAggregateCommands': {
                  const target = yield* Schema.decodeUnknown(
                    Schema.parseJson(
                      FinalizeAggregateCommandsSystemWriteTargetSchema,
                    ),
                  )(row.target).pipe(
                    mapParseError({
                      code: 'system-write-aggregate-target-invalid',
                      prefix:
                        'Stored finalizeAggregateCommands target is invalid',
                      extra: { writeIndex: row.writeIndex },
                    }),
                  );
                  return {
                    row,
                    target,
                    operation: row.operation,
                    targetKey: [
                      row.generationId,
                      'AggregateRepo',
                      target.aggregateId,
                      target.aggregateName,
                    ].join('/'),
                  };
                }
                case 'finalizeServiceCommands': {
                  const target = yield* Schema.decodeUnknown(
                    Schema.parseJson(
                      FinalizeServiceCommandsSystemWriteTargetSchema,
                    ),
                  )(row.target).pipe(
                    mapParseError({
                      code: 'system-write-service-target-invalid',
                      prefix:
                        'Stored finalizeServiceCommands target is invalid',
                      extra: { writeIndex: row.writeIndex },
                    }),
                  );
                  return {
                    row,
                    target,
                    operation: row.operation,
                    targetKey: [
                      row.generationId,
                      'ServiceRepo',
                      target.serviceName,
                    ].join('/'),
                  };
                }
              }
            }),
          );
        }),
      targetKey: pending => pending.targetKey,
      decode: pending =>
        Effect.gen(function* () {
          switch (pending.operation) {
            case 'pushCommands': {
              const commands = yield* Schema.decodeUnknown(
                Schema.parseJson(PushCommandsSystemWriteCommandsSchema),
              )(pending.row.commands).pipe(
                mapParseError({
                  code: 'system-write-push-commands-invalid',
                  prefix: 'Stored pushCommands commands are invalid',
                  extra: { writeIndex: pending.row.writeIndex },
                }),
              );
              return { ...pending, commands };
            }
            case 'finalizeAggregateCommands': {
              const commands = yield* Schema.decodeUnknown(
                Schema.parseJson(
                  FinalizeAggregateCommandsSystemWriteCommandsSchema,
                ),
              )(pending.row.commands).pipe(
                mapParseError({
                  code: 'system-write-aggregate-commands-invalid',
                  prefix:
                    'Stored finalizeAggregateCommands commands are invalid',
                  extra: { writeIndex: pending.row.writeIndex },
                }),
              );
              return { ...pending, commands };
            }
            case 'finalizeServiceCommands': {
              const commands = yield* Schema.decodeUnknown(
                Schema.parseJson(
                  FinalizeServiceCommandsSystemWriteCommandsSchema,
                ),
              )(pending.row.commands).pipe(
                mapParseError({
                  code: 'system-write-service-commands-invalid',
                  prefix: 'Stored finalizeServiceCommands commands are invalid',
                  extra: { writeIndex: pending.row.writeIndex },
                }),
              );
              return { ...pending, commands };
            }
          }
        }),
      deliver: (_pending, payload) =>
        Effect.gen(function* () {
          yield* Effect.try({
            try: () =>
              props.db.transaction(tx => {
                const latest = tx
                  .select({
                    deliveryAttemptCount:
                      props.systemWriteColumns.deliveryAttemptCount,
                    result: props.systemWriteColumns.result,
                  })
                  .from(props.systemWriteTable)
                  .where(
                    eq(
                      props.systemWriteColumns.writeIndex,
                      payload.row.writeIndex,
                    ),
                  )
                  .get();
                if (latest === undefined || latest.result !== null) {
                  throw new ZerospinError({
                    code: 'system-write-attempt-row-unavailable',
                    message:
                      'SystemRepo write disappeared or resolved before delivery',
                    extra: { writeIndex: payload.row.writeIndex },
                  });
                }
                const deliveryAttemptCount = Schema.decodeUnknownSync(
                  Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
                )(latest.deliveryAttemptCount);
                if (!Number.isSafeInteger(deliveryAttemptCount + 1)) {
                  throw new ZerospinError({
                    code: 'system-write-attempt-counter-exhausted',
                    message:
                      'SystemRepo write delivery attempt counter exhausted',
                    extra: { writeIndex: payload.row.writeIndex },
                  });
                }
                tx.update(props.systemWriteTable)
                  .set({
                    deliveryAttemptCount: deliveryAttemptCount + 1,
                    lastDeliveryAttemptAt: new Date(),
                    lastDeliveryFailure: null,
                  })
                  .where(
                    and(
                      eq(
                        props.systemWriteColumns.writeIndex,
                        payload.row.writeIndex,
                      ),
                      isNull(props.systemWriteColumns.result),
                    ),
                  )
                  .run();
              }),
            catch: error =>
              ZerospinError.isZerospinError(error)
                ? error
                : new ZerospinError({
                    code: 'system-write-attempt-persist-failed',
                    message:
                      'Failed to persist SystemRepo child delivery attempt',
                    cause: ZerospinError.prettyUnknownFailure(error),
                    extra: { writeIndex: payload.row.writeIndex },
                  }),
          });

          switch (payload.operation) {
            case 'pushCommands': {
              const aggregateFrontendRepo = yield* getAggregateFrontendRepo({
                key: {
                  generationId: payload.row.generationId,
                  aggregateId: payload.target.aggregateId,
                  aggregateName: payload.target.aggregateName,
                  userId: payload.target.userId,
                  frontendName: payload.target.frontendName,
                },
              });
              const encoded = yield* makeAsync(() =>
                aggregateFrontendRepo.pushCommands({
                  writeIndex: payload.row.writeIndex,
                  ...payload.target,
                  commands: payload.commands,
                }),
              );
              const rpcResult = yield* Schema.decodeUnknown(
                Schema.Union(
                  Schema.Struct({
                    _tag: Schema.Literal('Right'),
                    right: Schema.typeSchema(PushBlockSchema),
                  }),
                  Schema.Struct({
                    _tag: Schema.Literal('Left'),
                    left: Schema.encodedSchema(ZerospinError.schema),
                  }),
                ),
              )(encoded).pipe(
                mapParseError({
                  code: 'system-write-push-result-invalid',
                  prefix: 'AggregateFrontendRepo returned an invalid result',
                  extra: { writeIndex: payload.row.writeIndex },
                }),
              );
              const result =
                rpcResult._tag === 'Right'
                  ? Either.right(rpcResult.right)
                  : Either.left(
                      yield* Schema.decodeUnknown(ZerospinError.schema)(
                        rpcResult.left,
                      ).pipe(
                        mapParseError({
                          code: 'system-write-push-error-invalid',
                          prefix:
                            'AggregateFrontendRepo returned an invalid domain failure',
                          extra: { writeIndex: payload.row.writeIndex },
                        }),
                      ),
                    );
              return yield* Schema.encode(
                Schema.parseJson(PushCommandsSystemWriteResultSchema),
              )(result).pipe(
                mapParseError({
                  code: 'system-write-push-result-encode-failed',
                  prefix: 'Failed to encode terminal pushCommands result',
                  extra: { writeIndex: payload.row.writeIndex },
                }),
              );
            }
            case 'finalizeAggregateCommands': {
              const aggregateRepo = yield* getAggregateRepo({
                key: {
                  generationId: payload.row.generationId,
                  aggregateId: payload.target.aggregateId,
                  aggregateName: payload.target.aggregateName,
                },
              });
              const envelope = yield* makeAsync(() =>
                aggregateRepo.finalizeAggregateCommands({
                  traceContext: null,
                  args: [
                    {
                      writeIndex: payload.row.writeIndex,
                      ...payload.target,
                      commands: payload.commands,
                    },
                  ],
                }),
              );
              const decodedEnvelope = yield* Schema.decodeUnknown(
                Schema.Struct({
                  result: Schema.Union(
                    Schema.Struct({
                      _tag: Schema.Literal('Right'),
                      right: Schema.typeSchema(
                        AggregateFinalizationReceiptSchema,
                      ),
                    }),
                    Schema.Struct({
                      _tag: Schema.Literal('Left'),
                      left: Schema.encodedSchema(ZerospinError.schema),
                    }),
                  ),
                  telemetry: Schema.Unknown,
                }),
              )(envelope).pipe(
                mapParseError({
                  code: 'system-write-aggregate-result-invalid',
                  prefix: 'AggregateRepo returned an invalid result envelope',
                  extra: { writeIndex: payload.row.writeIndex },
                }),
              );
              const result =
                decodedEnvelope.result._tag === 'Right'
                  ? Either.right(decodedEnvelope.result.right)
                  : Either.left(
                      yield* Schema.decodeUnknown(ZerospinError.schema)(
                        decodedEnvelope.result.left,
                      ).pipe(
                        mapParseError({
                          code: 'system-write-aggregate-error-invalid',
                          prefix:
                            'AggregateRepo returned an invalid domain failure',
                          extra: { writeIndex: payload.row.writeIndex },
                        }),
                      ),
                    );
              return yield* Schema.encode(
                Schema.parseJson(
                  FinalizeAggregateCommandsSystemWriteResultSchema,
                ),
              )(result).pipe(
                mapParseError({
                  code: 'system-write-aggregate-result-encode-failed',
                  prefix:
                    'Failed to encode terminal finalizeAggregateCommands result',
                  extra: { writeIndex: payload.row.writeIndex },
                }),
              );
            }
            case 'finalizeServiceCommands': {
              const serviceRepo = yield* getServiceRepo({
                key: {
                  generationId: payload.row.generationId,
                  serviceName: payload.target.serviceName,
                },
              });
              const encoded = yield* makeAsync(() =>
                serviceRepo.finalizeServiceCommands({
                  writeIndex: payload.row.writeIndex,
                  serviceName: payload.target.serviceName,
                  commands: payload.commands,
                }),
              );
              const rpcResult = yield* Schema.decodeUnknown(
                Schema.Union(
                  Schema.Struct({
                    _tag: Schema.Literal('Right'),
                    right: Schema.typeSchema(ServiceFinalizationReceiptSchema),
                  }),
                  Schema.Struct({
                    _tag: Schema.Literal('Left'),
                    left: Schema.encodedSchema(ZerospinError.schema),
                  }),
                ),
              )(encoded).pipe(
                mapParseError({
                  code: 'system-write-service-result-invalid',
                  prefix: 'ServiceRepo returned an invalid result',
                  extra: { writeIndex: payload.row.writeIndex },
                }),
              );
              const result =
                rpcResult._tag === 'Right'
                  ? Either.right(rpcResult.right)
                  : Either.left(
                      yield* Schema.decodeUnknown(ZerospinError.schema)(
                        rpcResult.left,
                      ).pipe(
                        mapParseError({
                          code: 'system-write-service-error-invalid',
                          prefix:
                            'ServiceRepo returned an invalid domain failure',
                          extra: { writeIndex: payload.row.writeIndex },
                        }),
                      ),
                    );
              return yield* Schema.encode(
                Schema.parseJson(
                  FinalizeServiceCommandsSystemWriteResultSchema,
                ),
              )(result).pipe(
                mapParseError({
                  code: 'system-write-service-result-encode-failed',
                  prefix:
                    'Failed to encode terminal finalizeServiceCommands result',
                  extra: { writeIndex: payload.row.writeIndex },
                }),
              );
            }
          }
        }),
      acknowledge: (pending, encodedResult) =>
        props.interruptSystemWriteCapture &&
        pending.row.deliveryAttemptCount === 0
          ? Effect.fail(
              new ZerospinError({
                code: 'system-write-result-capture-interrupted',
                message:
                  'Test interruption fired after child commit and before SystemRepo result capture',
                extra: { writeIndex: pending.row.writeIndex },
              }),
            )
          : Effect.try({
              try: () => {
                props.db
                  .update(props.systemWriteTable)
                  .set({
                    result: encodedResult,
                    resolvedAt: new Date(),
                    lastDeliveryFailure: null,
                  })
                  .where(
                    and(
                      eq(
                        props.systemWriteColumns.writeIndex,
                        pending.row.writeIndex,
                      ),
                      isNull(props.systemWriteColumns.result),
                    ),
                  )
                  .run();
              },
              catch: ZerospinError.catch({
                code: 'system-write-result-capture-failed',
                message: 'Failed to capture terminal SystemRepo write result',
                extra: { writeIndex: pending.row.writeIndex },
              }),
            }),
      recordFailure: (pending, error) =>
        Effect.try({
          try: () => {
            const failure = Schema.encodeSync(
              Schema.parseJson(ZerospinError.schema),
            )(error);
            props.db
              .update(props.systemWriteTable)
              .set({ lastDeliveryFailure: failure })
              .where(
                and(
                  eq(
                    props.systemWriteColumns.writeIndex,
                    pending.row.writeIndex,
                  ),
                  isNull(props.systemWriteColumns.result),
                ),
              )
              .run();
          },
          catch: ZerospinError.catch({
            code: 'system-write-delivery-failure-persist-failed',
            message: 'Failed to persist SystemRepo write delivery failure',
            extra: { writeIndex: pending.row.writeIndex },
          }),
        }),
      hasPending: () =>
        Effect.map(
          readMatchingRows({ includeHeld: true }),
          rows => rows.length !== 0,
        ),
    });

    do {
      yield* props.deliveryQueue.drain({
        ...(props.alarm === true ? { alarm: true } : {}),
        lanes: [{ ...lane, requested: true }],
      });
      if (props.waitForTerminal === false) {
        return;
      }
      const pending = yield* lane.hasPending();
      if (!pending) {
        return;
      }
      yield* Effect.sleep('250 millis');
    } while (true);
  },
);
