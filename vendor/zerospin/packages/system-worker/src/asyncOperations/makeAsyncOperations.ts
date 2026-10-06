import { operationSink } from '@zerospin/core/contracts/operationSink';
import type { IContract } from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { runProgram } from '@zerospin/core/execution/runProgram';
import {
  encodeError,
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/shapes';
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { Cause, Effect, Schema } from 'effect';

import type { IAlarmRegistry } from '../makeAlarmRegistry/makeAlarmRegistry.js';

import {
  asyncOperationLifecycleCodec,
  asyncOperationsDbConfig,
} from './asyncOperationsDbConfig.js';

export type IAsyncOperations =
  typeof asyncOperationsDbConfig.tables.asyncOperations.codec.Type;
const { asyncOperations, asyncCommandOutbox, asyncCommandOutboxHead } =
  asyncOperationsDbConfig.schema;

/** Capture evidence and enqueue in the same synchronous transaction. */
export const recordResponse = makeTx('recordResponse')(function* (
  tx: ITx,
  commandId: `cmd_${string}`,
  response: typeof Schema.Json.Type,
  at: Date,
) {
  const row = tx
    .select()
    .from(asyncOperations)
    .where(eq(asyncOperations.asyncCommandId, commandId))
    .get();
  if (row === undefined) {
    return yield* makeZerospinError('async-operation-missing');
  }
  if (row.responseRecordedAt !== null) return;
  const work = yield* Schema.decodeUnknownEffect(asyncOperationLifecycleCodec)(
    row,
  ).pipe(
    mapParseError({
      code: 'async-operation-row-invalid',
      prefix: 'Invalid work row',
    }),
  );
  const head = tx
    .select()
    .from(asyncCommandOutboxHead)
    .where(eq(asyncCommandOutboxHead.singletonId, 1))
    .get();
  const index = (head?.lastIndex ?? 0) + 1;
  if (!Number.isSafeInteger(index)) {
    return yield* makeZerospinError('command-outbox-index-exhausted');
  }
  const captured = yield* Schema.encodeEffect(asyncOperationLifecycleCodec)({
    ...work,
    response,
    responseRecordedAt: at,
    lastProducerFailure: null,
    nextRunAt: null,
  }).pipe(
    mapParseError({
      code: 'async-operation-row-invalid',
      prefix: 'Invalid work row',
    }),
  );
  tx.update(asyncOperations)
    .set(captured)
    .where(eq(asyncOperations.asyncCommandId, commandId))
    .run();
  const command = yield* asyncOperationsDbConfig.tables.asyncCommandOutbox
    .encodeRow({
      outboxIndex: index,
      asyncCommandId: commandId,
      lastDeliveryFailure: null,
    })
    .pipe(
      mapParseError({
        code: 'async-command-invalid',
        prefix: 'Invalid recorded command',
      }),
    );
  tx.insert(asyncCommandOutbox).values(command).run();
  tx.insert(asyncCommandOutboxHead)
    .values({ singletonId: 1, lastIndex: index })
    .onConflictDoUpdate({
      target: asyncCommandOutboxHead.singletonId,
      set: { lastIndex: index },
    })
    .run();
});

/** Every item owns its producer, recording, and interruption settlement; other items run independently. */
export function makeAsyncOperations(props: {
  db: IDb;
  alarms: IAlarmRegistry;
  resolve(work: IAsyncOperations): Effect.Effect<IContract, IAnyError>;
  run(program: Effect.Effect<void, IAnyError, unknown>): Promise<void>;
  background(promise: Promise<void>): void;
  deliver(): Effect.Effect<void, IAnyError, unknown>;
  now?: () => number;
}) {
  const {
    db,
    alarms,
    resolve,
    run,
    background,
    deliver,
    now = Date.now,
  } = props;
  const runs = new Map<string, Promise<void>>();
  const arm = alarms.hold('asyncOperations');
  const reschedule = Effect.fn('asyncOperations.reschedule')(function* () {
    const row = db
      .select()
      .from(asyncOperations)
      .where(
        and(
          isNotNull(asyncOperations.asyncCommandId),
          isNull(asyncOperations.responseRecordedAt),
          isNotNull(asyncOperations.nextRunAt),
        ),
      )
      .orderBy(asc(asyncOperations.nextRunAt))
      .limit(1)
      .get();
    if (row === undefined) return yield* alarms.release('asyncOperations');
    yield* alarms.hold(
      'asyncOperations',
      Math.max(
        now() + (runs.has(row.asyncCommandId!) ? 1_000 : 1),
        row.nextRunAt!.getTime(),
      ),
    );
  });
  const execute = Effect.fn('asyncOperations.execute')(function* (
    work: IAsyncOperations,
  ) {
    let delay = 1_000;
    yield* Effect.gen(function* () {
      const contract = yield* resolve(work);
      const definition = contract.external;
      if (
        definition === undefined ||
        contract.commandName !== work.asyncContractName ||
        contract.version !== work.asyncContractVersion
      ) {
        return yield* makeZerospinError('async-operation-definition-mismatch');
      }
      delay = definition.retryDelayMs;
      if (work.asyncCommandId === null) {
        return yield* makeZerospinError('async-production-ineligible');
      }
      const payload = yield* runProgram(
        Schema.decodeUnknownEffect(makeEffectSchema(contract.payload))(
          work.payload,
          { onExcessProperty: 'error' },
        ).pipe(
          mapParseError({
            code: 'async-payload-invalid',
            prefix: 'Invalid frozen async payload',
          }),
        ),
      );
      // Persist a recovery deadline, never a claim, generation, or attempt token.
      db.update(asyncOperations)
        .set({ nextRunAt: new Date(now() + definition.timeoutMs) })
        .where(eq(asyncOperations.asyncCommandId, work.asyncCommandId))
        .run();
      yield* reschedule();
      const result = yield* Effect.suspend(() =>
        definition.request({ payload }),
      ).pipe(
        Effect.provideService(operationSink(), {
          emit: () => {
            throw makeZerospinError('external-producer-cannot-emit');
          },
        }),
        // Effect.timeout interrupts and awaits the losing fiber, including finalizers.
        Effect.timeout(definition.timeoutMs),
      );
      const validated = yield* runProgram(
        Schema.decodeUnknownEffect(Schema.toType(definition.response))(result, {
          onExcessProperty: 'error',
        }).pipe(
          mapParseError({
            code: 'external-response-invalid',
            prefix: 'Invalid external response',
          }),
        ),
      );
      const encoded = yield* runProgram(
        Schema.encodeEffect(definition.response)(validated).pipe(
          mapParseError({
            code: 'external-response-encode-failed',
            prefix: 'Cannot encode external response',
          }),
        ),
      );
      const json = yield* Schema.decodeUnknownEffect(Schema.Json)(encoded).pipe(
        mapParseError({
          code: 'external-response-json-invalid',
          prefix: 'External response must encode as JSON',
        }),
      );
      yield* recordResponse(db, work.asyncCommandId, json, new Date(now()));
    }).pipe(
      Effect.catchCause(cause =>
        Effect.gen(function* () {
          const current = db
            .select()
            .from(asyncOperations)
            .where(eq(asyncOperations.asyncCommandId, work.asyncCommandId))
            .get();
          if (current?.responseRecordedAt != null) return;
          const failure = yield* encodeError(
            makeZerospinError({
              code: 'external-producer-failed',
              cause: Cause.pretty(cause),
            }),
          );
          const row = yield* Schema.encodeEffect(asyncOperationLifecycleCodec)({
            ...work,
            nextRunAt: new Date(now() + delay),
            lastProducerFailure: failure,
          }).pipe(
            mapParseError({
              code: 'async-operation-row-invalid',
              prefix: 'Invalid work row',
            }),
          );
          db.update(asyncOperations)
            .set(row)
            .where(eq(asyncOperations.asyncCommandId, work.asyncCommandId))
            .run();
        }),
      ),
    );
    yield* reschedule();
    yield* deliver();
  });
  const recover = Effect.fn('asyncOperations.recover')(function* () {
    for (const row of db
      .select()
      .from(asyncOperations)
      .where(
        and(
          isNotNull(asyncOperations.asyncCommandId),
          isNull(asyncOperations.responseRecordedAt),
          isNotNull(asyncOperations.nextRunAt),
        ),
      )
      .all()) {
      if (row.nextRunAt!.getTime() > now() || runs.has(row.asyncCommandId!)) {
        continue;
      }
      const work = yield* Schema.decodeUnknownEffect(
        asyncOperationLifecycleCodec,
      )(row).pipe(
        mapParseError({
          code: 'async-operation-row-invalid',
          prefix: 'Invalid work row',
        }),
      );
      // Reserve before launching; settlement removes the slot only after the entire run finishes.
      const promise = Promise.resolve()
        .then(() => run(execute(work)))
        .finally(() => {
          runs.delete(row.asyncCommandId!);
        });
      runs.set(row.asyncCommandId!, promise);
      background(promise.catch(() => undefined));
    }
    yield* reschedule();
    // Delivery recovery is independent of any blocked producer.
    const delivery = run(deliver());
    background(delivery.catch(() => undefined));
  });
  alarms.register('asyncOperations', recover());
  return {
    arm,
    recover,
    afterExecution: <A, E, R>(callback: () => Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        yield* arm;
        return yield* Effect.suspend(callback);
      }).pipe(Effect.ensuring(recover().pipe(Effect.ignore))),
    settle: () => Promise.allSettled(runs.values()),
    activeCount: () => runs.size,
  };
}
