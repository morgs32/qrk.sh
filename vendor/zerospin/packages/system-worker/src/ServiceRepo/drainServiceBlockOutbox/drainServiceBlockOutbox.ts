import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { asc, eq, isNull } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { ServiceBlockSchema } from '../../blockSchemas.js';
import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { makeOutboxQueue } from '../../makeOutboxQueue/makeOutboxQueue.js';
import { getServiceBlockRepo } from '../../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import { serviceRepoDrizzleSchemas } from '../ServiceRepo.js';

export const drainServiceBlockOutbox = Effect.fn(
  'ServiceRepo.drainServiceBlockOutbox',
)(function* (props: {
  alarm?: true;
  db: IDb;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  storage: DurableObjectStorage;
  generationId: string;
  serviceName: string;
}): Effect.fn.Return<void, IAnyError, Async> {
  const { db, deliveryQueue, generationId, serviceName } = props;
  const lane = makeOutboxQueue({
    deliveryQueue,
    name: 'ServiceRepo.serviceBlockOutbox',
    readPending: () =>
      Effect.sync(() =>
        db
          .select()
          .from(serviceRepoDrizzleSchemas.serviceBlockOutbox)
          .where(
            isNull(serviceRepoDrizzleSchemas.serviceBlockOutbox.publishedAt),
          )
          .orderBy(
            asc(serviceRepoDrizzleSchemas.serviceBlockOutbox.serviceIndex),
          )
          .all(),
      ),
    targetKey: () => `${generationId}/${serviceName}`,
    decode: pendingRow =>
      Schema.decodeUnknown(Schema.parseJson(ServiceBlockSchema))(
        pendingRow.block,
      ).pipe(
        mapParseError({
          code: 'service-block-outbox-decode-failed',
          prefix: 'Failed to decode service block outbox row',
        }),
      ),
    deliver: (_pendingRow, block) =>
      Effect.gen(function* () {
        const serviceBlockRepo = yield* getServiceBlockRepo({
          key: { generationId, serviceName },
        });
        return yield* makeAsync<Schema.EitherEncoded<void, IAnyErrorJson>>(() =>
          serviceBlockRepo.publish(block),
        ).pipe(Effect.flatMap(decodeRpc));
      }),
    acknowledge: pendingRow =>
      Effect.sync(() => {
        db.update(serviceRepoDrizzleSchemas.serviceBlockOutbox)
          .set({ publishedAt: new Date(), failure: null })
          .where(
            eq(
              serviceRepoDrizzleSchemas.serviceBlockOutbox.lastServiceCursor,
              pendingRow.lastServiceCursor,
            ),
          )
          .run();
      }),
    recordFailure: (pendingRow, error) =>
      Effect.sync(() => {
        db.update(serviceRepoDrizzleSchemas.serviceBlockOutbox)
          .set({ failure: ZerospinError.stringify(error) })
          .where(
            eq(
              serviceRepoDrizzleSchemas.serviceBlockOutbox.lastServiceCursor,
              pendingRow.lastServiceCursor,
            ),
          )
          .run();
      }),
    hasPending: () =>
      Effect.sync(
        () =>
          db
            .select({
              lastServiceCursor:
                serviceRepoDrizzleSchemas.serviceBlockOutbox.lastServiceCursor,
            })
            .from(serviceRepoDrizzleSchemas.serviceBlockOutbox)
            .where(
              isNull(serviceRepoDrizzleSchemas.serviceBlockOutbox.publishedAt),
            )
            .get() !== undefined,
      ),
  });
  yield* deliveryQueue.drain({
    ...(props.alarm === true ? { alarm: true } : {}),
    lanes: [{ ...lane, requested: true }],
  });
});
