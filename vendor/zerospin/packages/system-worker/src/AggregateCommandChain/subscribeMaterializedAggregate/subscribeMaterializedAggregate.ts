import type { IDb } from '@zerospin/core/drizzle/types';
import { desc, isNotNull } from 'drizzle-orm';
import { Effect } from 'effect';

import { aggregateCommandChainDrizzleSchemas } from '../AggregateCommandChainDbConfig.js';

export const subscribeMaterializedAggregate = Effect.fn(
  'AggregateCommandChain.subscribeMaterializedAggregate',
)(function* (props: {
  currentAggregateIndex: number | null;
  db: IDb;
  materializedAggregateRepoName: string;
}) {
  const tip =
    props.db
      .select({
        aggregateIndex:
          aggregateCommandChainDrizzleSchemas.commands.aggregateIndex,
      })
      .from(aggregateCommandChainDrizzleSchemas.commands)
      .where(isNotNull(aggregateCommandChainDrizzleSchemas.commands.result))
      .orderBy(
        desc(aggregateCommandChainDrizzleSchemas.commands.aggregateIndex),
      )
      .limit(1)
      .get()?.aggregateIndex ?? null;

  yield* Effect.sync(() =>
    props.db
      .insert(
        aggregateCommandChainDrizzleSchemas.materializedAggregateSubscribers,
      )
      .values({
        materializedAggregateRepoName: props.materializedAggregateRepoName,
        currentAggregateIndex: props.currentAggregateIndex,
        queuedAggregateIndex: tip,
        lastDeliveryFailure: null,
      })
      .onConflictDoUpdate({
        target:
          aggregateCommandChainDrizzleSchemas.materializedAggregateSubscribers
            .materializedAggregateRepoName,
        set: {
          currentAggregateIndex: props.currentAggregateIndex,
          queuedAggregateIndex: tip,
          lastDeliveryFailure: null,
        },
      })
      .run(),
  );
});
