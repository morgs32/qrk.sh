import type { IDb } from '@zerospin/core/drizzle/types';
import { asc, eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { systemRepoDbConfig } from '../systemRepoDbConfig.js';

/** List registered aggregate IDs for one aggregate name in stable ID order. */
export const getAggregateIds = Effect.fn('SystemRepo.getAggregateIds')(
  function* (props: {
    db: IDb<typeof systemRepoDbConfig>;
    aggregateName: string;
  }) {
    return props.db
      .select({ aggregateId: systemRepoDbConfig.schema.aggregates.aggregateId })
      .from(systemRepoDbConfig.schema.aggregates)
      .where(
        eq(
          systemRepoDbConfig.schema.aggregates.aggregateName,
          props.aggregateName,
        ),
      )
      .orderBy(asc(systemRepoDbConfig.schema.aggregates.aggregateId))
      .all()
      .map(row => row.aggregateId);
  },
);
