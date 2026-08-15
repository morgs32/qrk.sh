import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { AggregateRepo } from '../AggregateRepo.js';

export const getAggregateRepo = Effect.fn('getAggregateRepo')(
  function* (props: {
    key: {
      generationId: string;
      aggregateId: string;
      aggregateName: string;
    };
  }) {
    const name = yield* AggregateRepo.boundDORepoConfig.nameUtils.makeName(
      props.key,
    );
    return env.AGGREGATE_REPO.getByName(name) as DurableObjectStub<
      Rpc.DurableObjectBranded & AggregateRepo
    >;
  },
);
