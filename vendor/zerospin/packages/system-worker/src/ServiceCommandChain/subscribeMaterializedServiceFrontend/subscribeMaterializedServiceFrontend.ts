import type { IDb } from '@zerospin/core/drizzle/types';
import { desc, isNotNull } from 'drizzle-orm';
import { Effect } from 'effect';

import { serviceCommandChainDrizzleSchemas } from '../ServiceCommandChainDbConfig.js';

export const subscribeMaterializedServiceFrontend = Effect.fn(
  'ServiceCommandChain.subscribeMaterializedServiceFrontend',
)(function* (props: {
  currentServiceIndex: number | null;
  db: IDb;
  frontendName: string;
  materializedServiceFrontendRepoName: string;
  userId: string;
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
    .insert(
      serviceCommandChainDrizzleSchemas.materializedServiceFrontendSubscribers,
    )
    .values({
      materializedServiceFrontendRepoName:
        props.materializedServiceFrontendRepoName,
      userId: props.userId,
      frontendName: props.frontendName,
      currentServiceIndex: props.currentServiceIndex,
      queuedServiceIndex: tip ?? props.currentServiceIndex,
      lastDeliveryFailure: null,
    })
    .onConflictDoUpdate({
      target:
        serviceCommandChainDrizzleSchemas.materializedServiceFrontendSubscribers
          .materializedServiceFrontendRepoName,
      set: {
        currentServiceIndex: props.currentServiceIndex,
        queuedServiceIndex: tip ?? props.currentServiceIndex,
        lastDeliveryFailure: null,
      },
    })
    .run();
  yield* Effect.void;
});
