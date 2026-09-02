import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { MaterializedServiceRepo } from '../MaterializedServiceRepo.js';

export const getMaterializedServiceRepo = Effect.fn(
  'getMaterializedServiceRepo',
)(function* (props: { key: { systemId: string; serviceName: string } }) {
  const name =
    yield* MaterializedServiceRepo.fixedDORepoConfig.nameUtils.makeName(
      props.key,
    );
  return env.MATERIALIZED_SERVICE_REPO.getByName(name);
});
