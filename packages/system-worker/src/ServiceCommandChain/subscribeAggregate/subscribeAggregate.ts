import type { IDb } from '@zerospin/core/drizzle/types';
import { desc, isNotNull } from 'drizzle-orm';
import { Effect } from 'effect';

import { serviceCommandChainDrizzleSchemas } from '../ServiceCommandChainDbConfig.js';

export const subscribeAggregate = Effect.fn(
  'ServiceCommandChain.subscribeAggregate',
)(function* (props: {
  aggregateCommandChainName: string;
  aggregateId: string;
  aggregateName: string;
  currentServiceIndex: number | null;
  db: IDb;
}) {
  const tip = props.db
    .select({
      serviceIndex: serviceCommandChainDrizzleSchemas.commands.serviceIndex,
    })
    .from(serviceCommandChainDrizzleSchemas.commands)
    .where(isNotNull(serviceCommandChainDrizzleSchemas.commands.result))
    .orderBy(desc(serviceCommandChainDrizzleSchemas.commands.serviceIndex))
    .limit(1)
    .get()?.serviceIndex;
  props.db
    .insert(serviceCommandChainDrizzleSchemas.aggregateSubscribers)
    .values({
      aggregateCommandChainName: props.aggregateCommandChainName,
      aggregateId: props.aggregateId,
      aggregateName: props.aggregateName,
      currentServiceIndex: props.currentServiceIndex,
      queuedServiceIndex: tip ?? props.currentServiceIndex,
      lastDeliveryFailure: null,
    })
    .onConflictDoUpdate({
      target:
        serviceCommandChainDrizzleSchemas.aggregateSubscribers
          .aggregateCommandChainName,
      set: {
        currentServiceIndex: props.currentServiceIndex,
        queuedServiceIndex: tip ?? props.currentServiceIndex,
        lastDeliveryFailure: null,
      },
    })
    .run();
  yield* Effect.void;
});
