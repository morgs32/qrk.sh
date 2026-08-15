import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { AggregateBlockRepo } from '../AggregateBlockRepo.js';

export const getAggregateBlockRepo = Effect.fn('getAggregateBlockRepo')(
  function* (props: {
    key: {
      generationId: string;
      aggregateId: string;
      aggregateName: string;
    };
  }) {
    const name = yield* AggregateBlockRepo.boundDORepoConfig.nameUtils.makeName(
      props.key,
    );
    return env.AGGREGATE_BLOCK_REPO.getByName(
      name,
    ) as DurableObjectStub<Rpc.DurableObjectBranded> &
      InstanceType<typeof AggregateBlockRepo>;
  },
);
