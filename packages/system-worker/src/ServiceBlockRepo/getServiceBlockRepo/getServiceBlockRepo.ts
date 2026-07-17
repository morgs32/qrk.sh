import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { ServiceBlockRepo } from '../ServiceBlockRepo.js';

export const getServiceBlockRepo = Effect.fn('getServiceBlockRepo')(
  function* (props: {
    key: {
      generationId: string;
      serviceName: string;
    };
  }) {
    const name = yield* ServiceBlockRepo.repoUtils.nameUtils.makeName(
      props.key,
    );
    return env.SERVICE_BLOCK_REPO.getByName(name) as DurableObjectStub<
      Rpc.DurableObjectBranded & ServiceBlockRepo
    >;
  },
);
