import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { AccountBlockRepo } from '../AccountBlockRepo.js';

export const getAccountBlockRepo = Effect.fn('getAccountBlockRepo')(
  function* (props: {
    key: {
      generationId: string;
      accountId: string;
      accountName: string;
    };
  }) {
    const name = yield* AccountBlockRepo.repoUtils.nameUtils.makeName(
      props.key,
    );
    return env.ACCOUNT_BLOCK_REPO.getByName(
      name,
    ) as DurableObjectStub<Rpc.DurableObjectBranded> &
      InstanceType<typeof AccountBlockRepo>;
  },
);
