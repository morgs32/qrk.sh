import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import {
  ServiceRepo,
  type IServiceRepoRpcTarget,
} from '../ServiceRepo.js';

export const getServiceRepo = Effect.fn('getServiceRepo')(function* (props: {
  key: {
    generationId: string;
    serviceName: string;
  };
}) {
  const name = yield* ServiceRepo.repoUtils.nameUtils.makeName(props.key);
  return env.SERVICE_REPO.getByName(name) as DurableObjectStub<
    Rpc.DurableObjectBranded
  > &
    IServiceRepoRpcTarget;
});
