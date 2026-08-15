/*
 * Delivers AggregateFrontendRepo PushBlocks to AggregateRepo in write order.
 * Each block gets three total attempts. A terminal delivery failure is stored
 * on that row and stops this drain so later blocks cannot overtake it.
 */

import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { PushBlockSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { dutils } from '@zerospin/core/utils/dutils';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import {
  makeTelemetryCollector,
  makeTelemetryLayer,
  makeTraceableRpcTarget,
} from '@zerospin/logger';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { getAggregateRepo } from '../../AggregateRepo/getAggregateRepo/getAggregateRepo.js';
import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { makeOutboxQueue } from '../../makeOutboxQueue/makeOutboxQueue.js';
import { getSystemLogRepo } from '../../SystemLogRepo/getSystemLogRepo/getSystemLogRepo.js';
import { aggregateFrontendRepoDrizzleSchemas } from '../AggregateFrontendRepo.js';

export const drainPushBlockOutbox = Effect.fn(
  'AggregateFrontendRepo.drainPushBlockOutbox',
)(function* (props: {
  alarm?: true;
  db: IDb;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  key: {
    generationId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
}): Effect.fn.Return<void, IAnyError, Async> {
  const { db, deliveryQueue, key } = props;
  const lane = makeOutboxQueue({
    deliveryQueue,
    name: 'AggregateFrontendRepo.pushBlockOutbox',
    readPending: () =>
      Effect.sync(() =>
        db
          .select()
          .from(aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox)
          .where(
            isNull(
              aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox.finalizedAt,
            ),
          )
          .orderBy(
            asc(aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox.writeIndex),
          )
          .all(),
      ),
    targetKey: () =>
      `${key.generationId}/${key.aggregateId}/${key.aggregateName}`,
    decode: row =>
      Effect.gen(function* () {
        const pushBlock = yield* Schema.decodeUnknown(
          Schema.parseJson(PushBlockSchema),
        )(row.block).pipe(
          mapParseError({
            code: 'aggregate-frontend-push-block-outbox-decode-failed',
            prefix: `Failed to decode PushBlock outbox row ${row.writeIndex}`,
          }),
        );
        return { collector: makeTelemetryCollector(), pushBlock };
      }),
    deliver: (_row, delivery) =>
      Effect.gen(function* () {
        const aggregateRepo = yield* getAggregateRepo({
          key: {
            generationId: key.generationId,
            aggregateId: key.aggregateId,
            aggregateName: key.aggregateName,
          },
        });
        const tracedAggregateRepo = makeTraceableRpcTarget(aggregateRepo);
        yield* tracedAggregateRepo
          .finalizePushBlock({ pushBlock: delivery.pushBlock })
          .pipe(
            Effect.mapError(error =>
              error instanceof Error
                ? new ZerospinError({
                    code: 'push-block-aggregate-finalization-rpc-failed',
                    message: error.message,
                    cause: ZerospinError.prettyUnknownFailure(error),
                  })
                : Schema.decodeUnknownSync(ZerospinError.schema)(error),
            ),
            Effect.asVoid,
            Effect.provide(makeTelemetryLayer(delivery.collector)),
          );
        return { collector: delivery.collector };
      }),
    acknowledge: (row, result) =>
      Effect.gen(function* () {
        const batch = result.collector.flush();
        yield* Effect.gen(function* () {
          const systemLogRepo = yield* getSystemLogRepo({
            key: { generationId: key.generationId },
          });
          const encoded = yield* makeAsync(() =>
            systemLogRepo.appendTelemetryBatch({
              batch,
            }),
          );
          yield* decodeRpc(encoded);
        }).pipe(Effect.catchAll(() => Effect.void));
        db.update(aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox)
          .set({ finalizedAt: yield* dutils.date(), failure: null })
          .where(
            eq(
              aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox.writeIndex,
              row.writeIndex,
            ),
          )
          .run();
      }),
    recordFailure: (row, error, delivery) =>
      Effect.gen(function* () {
        const batch = delivery.collector.flush();
        yield* Effect.gen(function* () {
          const systemLogRepo = yield* getSystemLogRepo({
            key: { generationId: key.generationId },
          });
          const encoded = yield* makeAsync(() =>
            systemLogRepo.appendTelemetryBatch({
              batch,
            }),
          );
          yield* decodeRpc(encoded);
        }).pipe(Effect.catchAll(() => Effect.void));
        db.update(aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox)
          .set({ failure: ZerospinError.stringify(error) })
          .where(
            and(
              eq(
                aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox.writeIndex,
                row.writeIndex,
              ),
              isNull(
                aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox.finalizedAt,
              ),
            ),
          )
          .run();
      }),
    hasPending: () =>
      Effect.sync(
        () =>
          db
            .select({
              writeIndex:
                aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox.writeIndex,
            })
            .from(aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox)
            .where(
              isNull(
                aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox.finalizedAt,
              ),
            )
            .get() !== undefined,
      ),
  });
  yield* deliveryQueue.drain({
    ...(props.alarm === true ? { alarm: true } : {}),
    lanes: [{ ...lane, requested: true }],
  });
});
