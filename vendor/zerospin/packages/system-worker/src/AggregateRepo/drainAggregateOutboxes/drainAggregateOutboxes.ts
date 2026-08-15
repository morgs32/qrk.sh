import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  EncodedExecutedAggregateCommandSchema,
  EncodedFailedAggregateCommandSchema,
  ExecutedPushedCommandSchema,
  FinalizedFailedStagedReplicaCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
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

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { makeOutboxQueue } from '../../makeOutboxQueue/makeOutboxQueue.js';
import { getServiceBlockRepo } from '../../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import type { IAggregateBlock } from '../../types.js';
import { aggregateRepoDrizzleSchemas } from '../AggregateRepo.js';
import { publishAggregateBlock } from '../finalizeAggregateCommands/publishAggregateBlock.js';
import { upsertAggregateBlock } from '../finalizeAggregateCommands/upsertAggregateBlock.js';

export const drainAggregateOutboxes = Effect.fn(
  'AggregateRepo.drainAggregateOutboxes',
)(function* (props: {
  alarm?: true;
  aggregateRepoName: string;
  generationId: string;
  aggregateId: string;
  aggregateName: string;
  db: IDb;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  storage: DurableObjectStorage;
}): Effect.fn.Return<void, IAnyError, Async> {
  const {
    aggregateId,
    aggregateName,
    aggregateRepoName,
    db,
    deliveryQueue,
    generationId,
  } = props;
  const subscriptionLane = makeOutboxQueue({
    deliveryQueue,
    name: 'AggregateRepo.serviceSubscriptions',
    readPending: () =>
      Effect.sync(() =>
        db
          .select()
          .from(aggregateRepoDrizzleSchemas.serviceSubscriptions)
          .where(
            isNull(
              aggregateRepoDrizzleSchemas.serviceSubscriptions.subscribedAt,
            ),
          )
          .all(),
      ),
    targetKey: subscription => subscription.serviceRepoName,
    decode: subscription => Effect.succeed(subscription),
    deliver: (_subscription, delivery) =>
      Effect.gen(function* () {
        const serviceBlockRepo = yield* getServiceBlockRepo({
          key: { generationId, serviceName: delivery.serviceName },
        });
        return yield* makeAsync<Schema.EitherEncoded<void, IAnyErrorJson>>(() =>
          serviceBlockRepo.subscribeAggregate({
            aggregateRepoName,
            aggregateId,
            aggregateName,
            currentServiceCursor: delivery.currentServiceCursor,
            currentServiceIndex: delivery.currentServiceIndex,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
      }),
    acknowledge: subscription =>
      Effect.sync(() => {
        db.update(aggregateRepoDrizzleSchemas.serviceSubscriptions)
          .set({ subscribedAt: new Date(), failure: null })
          .where(
            eq(
              aggregateRepoDrizzleSchemas.serviceSubscriptions.serviceRepoName,
              subscription.serviceRepoName,
            ),
          )
          .run();
      }),
    recordFailure: (subscription, error) =>
      Effect.sync(() => {
        db.update(aggregateRepoDrizzleSchemas.serviceSubscriptions)
          .set({ failure: ZerospinError.stringify(error) })
          .where(
            eq(
              aggregateRepoDrizzleSchemas.serviceSubscriptions.serviceRepoName,
              subscription.serviceRepoName,
            ),
          )
          .run();
      }),
    hasPending: () =>
      Effect.sync(
        () =>
          db
            .select({
              serviceRepoName:
                aggregateRepoDrizzleSchemas.serviceSubscriptions
                  .serviceRepoName,
            })
            .from(aggregateRepoDrizzleSchemas.serviceSubscriptions)
            .where(
              isNull(
                aggregateRepoDrizzleSchemas.serviceSubscriptions.subscribedAt,
              ),
            )
            .get() !== undefined,
      ),
  });

  const aggregateBlockLane = makeOutboxQueue({
    deliveryQueue,
    name: 'AggregateRepo.aggregateBlockOutbox',
    readPending: () =>
      Effect.sync(() =>
        db
          .select()
          .from(aggregateRepoDrizzleSchemas.aggregateBlockOutbox)
          .where(
            isNull(
              aggregateRepoDrizzleSchemas.aggregateBlockOutbox.publishedAt,
            ),
          )
          .orderBy(
            asc(
              aggregateRepoDrizzleSchemas.aggregateBlockOutbox.aggregateIndex,
            ),
          )
          .all(),
      ),
    targetKey: () => `${generationId}/${aggregateId}/${aggregateName}`,
    decode: row =>
      Effect.gen(function* () {
        const executedCommands = yield* Schema.decodeUnknown(
          Schema.parseJson(
            Schema.Array(
              Schema.Union(
                EncodedExecutedAggregateCommandSchema,
                ExecutedPushedCommandSchema,
              ),
            ),
          ),
        )(row.executedCommands).pipe(
          mapParseError({
            code: 'aggregate-block-outbox-executed-commands-decode-failed',
            prefix: 'Failed to decode AggregateRepo outbox executed commands',
          }),
        );
        const failedCommands = yield* Schema.decodeUnknown(
          Schema.parseJson(
            Schema.Array(
              Schema.Union(
                EncodedFailedAggregateCommandSchema,
                FinalizedFailedStagedReplicaCommandSchema,
                FailedPushedCommandSchema,
              ),
            ),
          ),
        )(row.failedCommands).pipe(
          mapParseError({
            code: 'aggregate-block-outbox-failed-commands-decode-failed',
            prefix: 'Failed to decode AggregateRepo outbox failed commands',
          }),
        );
        const appliedMutations = yield* Schema.decodeUnknown(
          Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
        )(row.appliedMutations).pipe(
          mapParseError({
            code: 'aggregate-block-outbox-applied-mutations-decode-failed',
            prefix: 'Failed to decode AggregateRepo outbox applied mutations',
          }),
        );
        return {
          writeIndex: row.writeIndex,
          lastAggregateCursor: row.lastAggregateCursor,
          aggregateIndex: row.aggregateIndex,
          executedCommands,
          failedCommands,
          appliedMutations,
        } satisfies IAggregateBlock;
      }),
    deliver: (_row, aggregateBlock) =>
      publishAggregateBlock({
        generationId,
        aggregateId,
        aggregateName,
        aggregateBlock,
      }),
    acknowledge: (_row, _result, aggregateBlock) =>
      upsertAggregateBlock({
        aggregateBlock: {
          ...aggregateBlock,
          failure: null,
          publishedAt: new Date(),
        },
        db,
      }),
    recordFailure: (_row, error, aggregateBlock) =>
      upsertAggregateBlock({
        aggregateBlock: {
          ...aggregateBlock,
          failure: error,
          publishedAt: null,
        },
        db,
      }),
    hasPending: () =>
      Effect.sync(
        () =>
          db
            .select({
              aggregateIndex:
                aggregateRepoDrizzleSchemas.aggregateBlockOutbox.aggregateIndex,
            })
            .from(aggregateRepoDrizzleSchemas.aggregateBlockOutbox)
            .where(
              isNull(
                aggregateRepoDrizzleSchemas.aggregateBlockOutbox.publishedAt,
              ),
            )
            .get() !== undefined,
      ),
  });

  yield* deliveryQueue.drain({
    ...(props.alarm === true ? { alarm: true } : {}),
    lanes: [
      { ...subscriptionLane, requested: true },
      { ...aggregateBlockLane, requested: true },
    ],
  });
});
