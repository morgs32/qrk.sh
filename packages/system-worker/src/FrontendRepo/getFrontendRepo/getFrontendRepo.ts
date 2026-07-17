import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { FrontendRepo } from '../FrontendRepo.js';

export const getFrontendRepo = Effect.fn('getFrontendRepo')(function* (props: {
  key: {
    generationId: string;
    accountId: string;
    accountName: string;
    actorId: string;
    actorName: string;
    frontendName: string;
  };
}) {
  const name = yield* FrontendRepo.repoUtils.nameUtils.makeName(props.key);
  return env.FRONTEND_REPO.getByName(name) as DurableObjectStub<
    Rpc.DurableObjectBranded & FrontendRepo
  >;
});
