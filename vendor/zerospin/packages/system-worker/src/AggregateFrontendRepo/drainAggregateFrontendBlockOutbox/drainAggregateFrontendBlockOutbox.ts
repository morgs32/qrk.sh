import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { AggregateFrontendBlockSchema } from '@zerospin/core/session/AggregateFrontendBlockSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { asc, eq, isNull } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { getAggregateFrontendBlockRepo } from '../../AggregateFrontendBlockRepo/getAggregateFrontendBlockRepo/getAggregateFrontendBlockRepo.js';
import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { makeOutboxQueue } from '../../makeOutboxQueue/makeOutboxQueue.js';
import { aggregateFrontendRepoDrizzleSchemas } from '../AggregateFrontendRepo.js';

export const drainAggregateFrontendBlockOutbox = Effect.fn(
  'AggregateFrontendRepo.drainAggregateFrontendBlockOutbox',
)(function* (props: {
  alarm?: true;
  configuredSystemId: string;
  db: IDb;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  key: {
    generationId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
  storage: DurableObjectStorage;
}): Effect.fn.Return<void, IAnyError, Async> {
  const { db, deliveryQueue, key } = props;
  const lane = makeOutboxQueue({
    deliveryQueue,
    name: 'AggregateFrontendRepo.aggregateFrontendBlockOutbox',
    readPending: () =>
      Effect.sync(() => {
        const rows = db
          .select()
          .from(
            aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox,
          )
          .where(
            isNull(
              aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox
                .publishedAt,
            ),
          )
          .orderBy(
            asc(
              aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox
                .frontendIndex,
            ),
          )
          .all();
        return rows.length === 0 ? [] : [rows];
      }),
    targetKey: () =>
      `${key.generationId}/${key.aggregateId}/${key.aggregateName}/${key.userId}/${key.frontendName}`,
    decode: rows =>
      Effect.forEach(rows, row =>
        Schema.decodeUnknown(Schema.parseJson(AggregateFrontendBlockSchema))(
          row.block,
        ).pipe(
          mapParseError({
            code: 'aggregate-frontend-block-outbox-decode-failed',
            prefix: 'Failed to decode frontend block outbox row',
          }),
        ),
      ),
    deliver: (_rows, blocks) =>
      Effect.gen(function* () {
        const aggregateFrontendBlockRepo = yield* getAggregateFrontendBlockRepo(
          { key },
        );
        return yield* makeAsync<Schema.EitherEncoded<void, IAnyErrorJson>>(() =>
          aggregateFrontendBlockRepo.storeAggregateFrontendBlocks({ blocks }),
        ).pipe(Effect.flatMap(decodeRpc));
      }),
    acknowledge: rows =>
      Effect.sync(() => {
        for (const row of rows) {
          db.update(
            aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox,
          )
            .set({ publishedAt: new Date(), failure: null })
            .where(
              eq(
                aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox
                  .frontendIndex,
                row.frontendIndex,
              ),
            )
            .run();
        }
      }),
    recordFailure: (rows, error) =>
      Effect.sync(() => {
        for (const row of rows) {
          db.update(
            aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox,
          )
            .set({ failure: ZerospinError.stringify(error) })
            .where(
              eq(
                aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox
                  .frontendIndex,
                row.frontendIndex,
              ),
            )
            .run();
        }
      }),
    hasPending: () =>
      Effect.sync(
        () =>
          db
            .select({
              frontendIndex:
                aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox
                  .frontendIndex,
            })
            .from(
              aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox,
            )
            .where(
              isNull(
                aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox
                  .publishedAt,
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
