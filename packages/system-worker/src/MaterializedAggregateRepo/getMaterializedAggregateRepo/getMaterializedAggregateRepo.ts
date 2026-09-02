import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { MaterializedAggregateRepo } from '../MaterializedAggregateRepo.js';

export const getMaterializedAggregateRepo = Effect.fn(
  'getMaterializedAggregateRepo',
)(function* (props: {
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
  };
}) {
  const name =
    yield* MaterializedAggregateRepo.fixedDORepoConfig.nameUtils.makeName(
      props.key,
    );
  return env.MATERIALIZED_AGGREGATE_REPO.getByName(name);
});
