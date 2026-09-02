import type { IDb } from '@zerospin/core/drizzle/types';
import { desc, isNotNull } from 'drizzle-orm';
import { Effect } from 'effect';

import { serviceCommandChainDrizzleSchemas } from '../ServiceCommandChainDbConfig.js';

export const subscribeMaterializedService = Effect.fn(
  'ServiceCommandChain.subscribeMaterializedService',
)(function* (props: {
  currentServiceIndex: number | null;
  db: IDb;
  materializedServiceRepoName: string;
}) {
  const tip =
    props.db
      .select({
        serviceIndex: serviceCommandChainDrizzleSchemas.commands.serviceIndex,
      })
      .from(serviceCommandChainDrizzleSchemas.commands)
      .where(isNotNull(serviceCommandChainDrizzleSchemas.commands.result))
      .orderBy(desc(serviceCommandChainDrizzleSchemas.commands.serviceIndex))
      .limit(1)
      .get()?.serviceIndex ?? null;
  yield* Effect.sync(() =>
    props.db
      .insert(serviceCommandChainDrizzleSchemas.materializedServiceSubscribers)
      .values({
        materializedServiceRepoName: props.materializedServiceRepoName,
        currentServiceIndex: props.currentServiceIndex,
        queuedServiceIndex: tip,
        lastDeliveryFailure: null,
      })
      .onConflictDoUpdate({
        target:
          serviceCommandChainDrizzleSchemas.materializedServiceSubscribers
            .materializedServiceRepoName,
        set: {
          currentServiceIndex: props.currentServiceIndex,
          queuedServiceIndex: tip,
          lastDeliveryFailure: null,
        },
      })
      .run(),
  );
});
