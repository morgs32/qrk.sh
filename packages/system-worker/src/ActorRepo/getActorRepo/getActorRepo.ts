import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { ActorRepo } from '../ActorRepo.js';

export const getActorRepo = Effect.fn('getActorRepo')(function* (props: {
  key: {
    generationId: string;
    accountId: string;
    accountName: string;
    actorName: string;
    actorId: string;
  };
}) {
  const name = yield* ActorRepo.repoUtils.nameUtils.makeName(props.key);
  return env.ACTOR_REPO.getByName(name) as DurableObjectStub<
    Rpc.DurableObjectBranded & ActorRepo
  >;
});
