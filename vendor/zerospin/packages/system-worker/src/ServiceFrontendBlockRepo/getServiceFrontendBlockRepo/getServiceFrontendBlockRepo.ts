import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { ServiceFrontendBlockRepo } from '../ServiceFrontendBlockRepo.js';

export const getServiceFrontendBlockRepo = Effect.fn(
  'getServiceFrontendBlockRepo',
)(function* (props: {
  key: {
    generationId: string;
    serviceName: string;
    userId: string;
    frontendName: string;
  };
}) {
  const name =
    yield* ServiceFrontendBlockRepo.boundDORepoConfig.nameUtils.makeName(
      props.key,
    );
  return env.SERVICE_FRONTEND_BLOCK_REPO.getByName(name);
});
