import type { ITx } from '@zerospin/core/drizzle/types';
import { eq } from 'drizzle-orm';

import { aggregateVersionRepoDbConfig } from './aggregateVersionRepoDbConfig.js';

/** Neither receiver owns replay material still needed by the other pending delivery. */
export function deleteDeliveredAggregateMaterial(
  tx: ITx,
  indices: readonly number[],
) {
  const tables = aggregateVersionRepoDbConfig.schema;
  for (const index of indices) {
    if (
      tx
        .select()
        .from(tables.executedCommandOutbox)
        .where(eq(tables.executedCommandOutbox.executedIndex, index))
        .get() !== undefined ||
      tx
        .select()
        .from(tables.executedAggregateCommandOutbox)
        .where(eq(tables.executedAggregateCommandOutbox.executedIndex, index))
        .get() !== undefined
    ) {
      continue;
    }
    tx.delete(tables.modelOperations)
      .where(eq(tables.modelOperations.executedIndex, index))
      .run();
  }
}
