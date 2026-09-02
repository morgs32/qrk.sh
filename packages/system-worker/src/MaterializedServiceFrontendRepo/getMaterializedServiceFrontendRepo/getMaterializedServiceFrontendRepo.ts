import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { MaterializedServiceFrontendRepo } from '../MaterializedServiceFrontendRepo.js';

export const getMaterializedServiceFrontendRepo = Effect.fn(
  'getMaterializedServiceFrontendRepo',
)(function* (props: {
  key: {
    systemId: string;
    serviceName: string;
    userId: string;
    frontendName: string;
  };
}) {
  const { key } = props;
  const name =
    yield* MaterializedServiceFrontendRepo.fixedDORepoConfig.nameUtils.makeName(
      key,
    );
  return env.MATERIALIZED_SERVICE_FRONTEND_REPO.getByName(name);
});
