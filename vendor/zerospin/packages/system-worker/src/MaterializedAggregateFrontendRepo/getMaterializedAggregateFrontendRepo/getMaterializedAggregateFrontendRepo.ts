import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { MaterializedAggregateFrontendRepo } from '../MaterializedAggregateFrontendRepo.js';

export const getMaterializedAggregateFrontendRepo = Effect.fn(
  'getMaterializedAggregateFrontendRepo',
)(function* (props: {
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
}) {
  const { key } = props;
  const name =
    yield* MaterializedAggregateFrontendRepo.fixedDORepoConfig.nameUtils.makeName(
      key,
    );
  return env.MATERIALIZED_AGGREGATE_FRONTEND_REPO.getByName(name);
});
