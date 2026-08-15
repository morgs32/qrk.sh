import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  mapParseError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { asc, desc, eq, gt, lt } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';

import { ServiceBlockSchema } from '../../blockSchemas.js';
import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { makeFanoutQueue } from '../../makeFanoutQueue/makeFanoutQueue.js';
import type { IServiceBlock } from '../../types.js';
import { serviceBlockDrizzleSchemas } from '../ServiceBlockRepo.js';

export const drainAggregateSubscribers = Effect.fn(
  'ServiceBlockRepo.drainAggregateSubscribers',
)(function* (props: {
  alarm?: true;
  db: IDb;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  serviceName: string;
}): Effect.fn.Return<void, IAnyError, Async> {
  const { db, deliveryQueue, serviceName } = props;
  const readSubscribers = Effect.fn(
    'ServiceBlockRepo.readAggregateSubscribers',
  )(function* () {
    yield* Effect.void;
    const terminal = db
      .select({
        serviceIndex: serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex,
      })
      .from(serviceBlockDrizzleSchemas.serviceBlocks)
      .orderBy(desc(serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex))
      .limit(1)
      .get();
    if (terminal === undefined) {
      return [];
    }
    return db
      .select()
      .from(serviceBlockDrizzleSchemas.aggregateSubscribers)
      .where(
        lt(
          serviceBlockDrizzleSchemas.aggregateSubscribers.currentServiceIndex,
          terminal.serviceIndex,
        ),
      )
      .all();
  });
  const lane = makeFanoutQueue({
    deliveryQueue,
    name: 'ServiceBlockRepo.aggregateSubscribers',
    readSubscribers,
    subscriberKey: subscriber => subscriber.aggregateRepoName,
    processSubscriber: (subscriber, retry) =>
      Effect.gen(function* () {
        const blockRows = db
          .select()
          .from(serviceBlockDrizzleSchemas.serviceBlocks)
          .where(
            gt(
              serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex,
              subscriber.currentServiceIndex,
            ),
          )
          .orderBy(asc(serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex))
          .all();
        if (blockRows.length === 0) {
          return true;
        }
        const blocks: IServiceBlock[] = [];
        for (const row of blockRows) {
          blocks.push(
            yield* Schema.decodeUnknown(Schema.parseJson(ServiceBlockSchema))(
              row.block,
            ).pipe(
              mapParseError({
                code: 'service-block-decode-failed',
                prefix: 'Failed to decode service block',
              }),
            ),
          );
        }
        const delivery = yield* retry(
          makeAsync<Schema.EitherEncoded<void, IAnyErrorJson>>(() =>
            env.AGGREGATE_REPO.getByName(
              subscriber.aggregateRepoName,
            ).handleServiceBlocks({ serviceName, blocks }),
          ).pipe(Effect.flatMap(decodeRpc)),
        ).pipe(Effect.either);
        if (Either.isLeft(delivery)) {
          db.update(serviceBlockDrizzleSchemas.aggregateSubscribers)
            .set({ lastDeliveryError: delivery.left.message })
            .where(
              eq(
                serviceBlockDrizzleSchemas.aggregateSubscribers
                  .aggregateRepoName,
                subscriber.aggregateRepoName,
              ),
            )
            .run();
          return false;
        }
        const lastBlock = blocks.at(-1);
        if (lastBlock === undefined) {
          return true;
        }
        db.update(serviceBlockDrizzleSchemas.aggregateSubscribers)
          .set({
            currentServiceCursor: lastBlock.lastServiceCursor,
            currentServiceIndex: lastBlock.serviceIndex,
            lastDeliveryError: null,
          })
          .where(
            eq(
              serviceBlockDrizzleSchemas.aggregateSubscribers.aggregateRepoName,
              subscriber.aggregateRepoName,
            ),
          )
          .run();
        return true;
      }),
    hasPending: () =>
      readSubscribers().pipe(Effect.map(subscribers => subscribers.length > 0)),
  });
  yield* deliveryQueue.drain({
    ...(props.alarm === true ? { alarm: true } : {}),
    lanes: [{ ...lane, requested: true }],
  });
});
