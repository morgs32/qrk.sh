import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { AggregateFrontendBlockRepo } from '../AggregateFrontendBlockRepo.js';

export const getAggregateFrontendBlockRepo = Effect.fn(
  'getAggregateFrontendBlockRepo',
)(function* (props: {
  key: {
    generationId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
}) {
  const name =
    yield* AggregateFrontendBlockRepo.boundDORepoConfig.nameUtils.makeName(
      props.key,
    );
  return env.AGGREGATE_FRONTEND_BLOCK_REPO.get(
    env.AGGREGATE_FRONTEND_BLOCK_REPO.idFromName(name),
  );
});
