import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { FrontendBlockRepo } from '../FrontendBlockRepo.js';

export const getFrontendBlockRepo = Effect.fn('getFrontendBlockRepo')(
  function* (props: {
    key: {
      generationId: string;
      accountId: string;
      accountName: string;
      actorId: string;
      actorName: string;
      frontendName: string;
    };
  }) {
    const name = yield* FrontendBlockRepo.repoUtils.nameUtils.makeName(
      props.key,
    );
    return env.FRONTEND_BLOCK_REPO.get(
      env.FRONTEND_BLOCK_REPO.idFromName(name),
    );
  },
);
