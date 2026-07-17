import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { ActorBlockRepo } from '../ActorBlockRepo.js';

export const getActorBlockRepo = Effect.fn('getActorBlockRepo')(
  function* (props: {
    key: {
      generationId: string;
      accountId: string;
      accountName: string;
      actorId: string;
      actorName: string;
    };
  }) {
    const name = yield* ActorBlockRepo.repoUtils.nameUtils.makeName(props.key);
    return env.ACTOR_BLOCK_REPO.getByName(
      name,
    ) as DurableObjectStub<Rpc.DurableObjectBranded> &
      InstanceType<typeof ActorBlockRepo>;
  },
);
