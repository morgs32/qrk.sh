import type { IDb } from '@zerospin/core/drizzle/types';
import { desc, eq, isNotNull } from 'drizzle-orm';
import { Effect } from 'effect';

import { aggregateCommandChainDrizzleSchemas } from '../AggregateCommandChainDbConfig.js';

export const subscribeMaterializedAggregateFrontend = Effect.fn(
  'AggregateCommandChain.subscribeMaterializedAggregateFrontend',
)(function* (props: {
  aggregateId: string;
  aggregateName: string;
  currentAggregateIndex: number | null;
  db: IDb;
  frontendName: string;
  materializedAggregateFrontendRepoName: string;
  userId: string;
}) {
  const tip = props.db
    .select({
      aggregateIndex:
        aggregateCommandChainDrizzleSchemas.commands.aggregateIndex,
    })
    .from(aggregateCommandChainDrizzleSchemas.commands)
    .where(isNotNull(aggregateCommandChainDrizzleSchemas.commands.result))
    .orderBy(desc(aggregateCommandChainDrizzleSchemas.commands.aggregateIndex))
    .limit(1)
    .get()?.aggregateIndex;
  props.db
    .insert(
      aggregateCommandChainDrizzleSchemas.materializedAggregateFrontendSubscribers,
    )
    .values({
      materializedAggregateFrontendRepoName:
        props.materializedAggregateFrontendRepoName,
      aggregateId: props.aggregateId,
      aggregateName: props.aggregateName,
      userId: props.userId,
      frontendName: props.frontendName,
      currentAggregateIndex: props.currentAggregateIndex,
      queuedAggregateIndex: tip ?? props.currentAggregateIndex,
      lastDeliveryFailure: null,
    })
    .onConflictDoUpdate({
      target:
        aggregateCommandChainDrizzleSchemas
          .materializedAggregateFrontendSubscribers
          .materializedAggregateFrontendRepoName,
      set: {
        currentAggregateIndex: props.currentAggregateIndex,
        queuedAggregateIndex: tip ?? props.currentAggregateIndex,
        lastDeliveryFailure: null,
      },
    })
    .run();

  const retained = props.db
    .select({
      materializedAggregateFrontendRepoName:
        aggregateCommandChainDrizzleSchemas
          .materializedAggregateFrontendSubscribers
          .materializedAggregateFrontendRepoName,
    })
    .from(
      aggregateCommandChainDrizzleSchemas.materializedAggregateFrontendSubscribers,
    )
    .where(
      eq(
        aggregateCommandChainDrizzleSchemas
          .materializedAggregateFrontendSubscribers
          .materializedAggregateFrontendRepoName,
        props.materializedAggregateFrontendRepoName,
      ),
    )
    .get();
  yield* Effect.sync(() => retained);
});
