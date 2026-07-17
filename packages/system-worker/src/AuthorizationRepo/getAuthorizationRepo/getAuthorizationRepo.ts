import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { AuthorizationRepo } from '../AuthorizationRepo.js';

export const getAuthorizationRepo = Effect.fn('getAuthorizationRepo')(
  function* (props: {
    key: {
      generationId: string;
      accountId: string;
      accountName: string;
    };
  }) {
    const name = yield* AuthorizationRepo.repoUtils.nameUtils.makeName(
      props.key,
    );
    return env.AUTHORIZATION_REPO.getByName(name) as DurableObjectStub<
      Rpc.DurableObjectBranded & AuthorizationRepo
    >;
  },
);
