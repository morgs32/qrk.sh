import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { genesisDispositionHash } from '../../aggregateDispositionHash/aggregateDispositionHash.js';
import type { AggregateVersionRepo } from '../AggregateVersionRepo.js';
import { aggregateVersionRepoDbConfig } from '../aggregateVersionRepoDbConfig.js';

/** Initialize the shared-input execution head after fixed-spec acceptance. */
export const onDOActivation = Effect.fn('AggregateVersionRepo.onDOActivation')(
  function* (props: { repo: Pick<AggregateVersionRepo, 'db' | 'key'> }) {
    const { repo } = props;
    const head = repo.db
      .select()
      .from(aggregateVersionRepoDbConfig.schema.head)
      .where(eq(aggregateVersionRepoDbConfig.schema.head.singletonId, 1))
      .get();
    if (!head) {
      // Retain the execution head before input delivery begins.
      repo.db
        .insert(aggregateVersionRepoDbConfig.schema.head)
        .values({
          singletonId: 1,
          aggregateIndex: 0,
          executedIndex: 0,
          dispositionHash: genesisDispositionHash(),
        })
        .run();
    }
  },
);
