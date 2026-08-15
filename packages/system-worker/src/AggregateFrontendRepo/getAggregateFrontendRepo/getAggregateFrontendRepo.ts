import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { AggregateFrontendRepo } from '../AggregateFrontendRepo.js';

export const getAggregateFrontendRepo = Effect.fn('getAggregateFrontendRepo')(
  function* (props: {
    key: {
      generationId: string;
      aggregateId: string;
      aggregateName: string;
      userId: string;
      frontendName: string;
    };
  }) {
    const name =
      yield* AggregateFrontendRepo.boundDORepoConfig.nameUtils.makeName(
        props.key,
      );
    return env.AGGREGATE_FRONTEND_REPO.getByName(name) as DurableObjectStub<
      Rpc.DurableObjectBranded & AggregateFrontendRepo
    >;
  },
);
