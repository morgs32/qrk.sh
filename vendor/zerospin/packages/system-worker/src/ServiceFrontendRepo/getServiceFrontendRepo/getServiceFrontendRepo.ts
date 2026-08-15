import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { ServiceFrontendRepo } from '../ServiceFrontendRepo.js';

export const getServiceFrontendRepo = Effect.fn('getServiceFrontendRepo')(
  function* (props: {
    key: {
      generationId: string;
      serviceName: string;
      userId: string;
      frontendName: string;
    };
  }) {
    const name =
      yield* ServiceFrontendRepo.boundDORepoConfig.nameUtils.makeName(
        props.key,
      );
    return env.SERVICE_FRONTEND_REPO.getByName(name);
  },
);
