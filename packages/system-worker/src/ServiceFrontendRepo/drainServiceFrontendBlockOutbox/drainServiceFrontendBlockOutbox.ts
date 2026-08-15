import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceFrontendBlockSchema } from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { asc, eq, isNull } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { makeOutboxQueue } from '../../makeOutboxQueue/makeOutboxQueue.js';
import { getServiceFrontendBlockRepo } from '../../ServiceFrontendBlockRepo/getServiceFrontendBlockRepo/getServiceFrontendBlockRepo.js';
import { serviceFrontendRepoDrizzleSchemas } from '../ServiceFrontendRepo.js';

export const drainServiceFrontendBlockOutbox = Effect.fn(
  'ServiceFrontendRepo.drainServiceFrontendBlockOutbox',
)(function* (props: {
  alarm?: true;
  db: IDb;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  key: {
    generationId: string;
    serviceName: string;
    userId: string;
    frontendName: string;
  };
  storage: DurableObjectStorage;
}): Effect.fn.Return<void, IAnyError, Async> {
  const { db, deliveryQueue, key } = props;
  const lane = makeOutboxQueue({
    deliveryQueue,
    name: 'ServiceFrontendRepo.serviceFrontendBlockOutbox',
    readPending: () =>
      Effect.sync(() => {
        const rows = db
          .select()
          .from(serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox)
          .where(
            isNull(
              serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox
                .publishedAt,
            ),
          )
          .orderBy(
            asc(
              serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox
                .frontendIndex,
            ),
          )
          .all();
        return rows.length === 0 ? [] : [rows];
      }),
    targetKey: () =>
      `${key.generationId}/${key.serviceName}/${key.userId}/${key.frontendName}`,
    decode: rows =>
      Effect.forEach(rows, row =>
        Schema.decodeUnknown(Schema.parseJson(ServiceFrontendBlockSchema))(
          row.block,
        ).pipe(
          mapParseError({
            code: 'service-frontend-block-outbox-decode-failed',
            prefix: 'Failed to decode frontend block outbox row',
          }),
        ),
      ),
    deliver: (_rows, blocks) =>
      Effect.gen(function* () {
        const serviceFrontendBlockRepo = yield* getServiceFrontendBlockRepo({
          key,
        });
        return yield* makeAsync<Schema.EitherEncoded<void, IAnyErrorJson>>(() =>
          serviceFrontendBlockRepo.storeServiceFrontendBlocks({ blocks }),
        ).pipe(Effect.flatMap(decodeRpc));
      }),
    acknowledge: rows =>
      Effect.sync(() => {
        for (const row of rows) {
          db.update(
            serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox,
          )
            .set({ publishedAt: new Date(), failure: null })
            .where(
              eq(
                serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox
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
            serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox,
          )
            .set({ failure: ZerospinError.stringify(error) })
            .where(
              eq(
                serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox
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
                serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox
                  .frontendIndex,
            })
            .from(serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox)
            .where(
              isNull(
                serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox
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
