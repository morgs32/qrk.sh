import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAggregateId } from '@zerospin/core/models/types';
import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { systemRepoDbConfig } from '../systemRepoDbConfig.js';

/** Check the exact aggregate name and ID within the owning SystemRepo. */
export const hasAggregate = Effect.fn('SystemRepo.hasAggregate')(
  function* (props: {
    db: IDb<typeof systemRepoDbConfig>;
    aggregateName: string;
    aggregateId: IAggregateId;
  }) {
    return (
      props.db
        .select({
          aggregateId: systemRepoDbConfig.schema.aggregates.aggregateId,
        })
        .from(systemRepoDbConfig.schema.aggregates)
        .where(
          and(
            eq(
              systemRepoDbConfig.schema.aggregates.aggregateName,
              props.aggregateName,
            ),
            eq(
              systemRepoDbConfig.schema.aggregates.aggregateId,
              props.aggregateId,
            ),
          ),
        )
        .get() !== undefined
    );
  },
);
