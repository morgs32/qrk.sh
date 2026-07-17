import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { AccountRepo } from '../AccountRepo.js';

export const getAccountRepo = Effect.fn('getAccountRepo')(function* (props: {
  key: {
    generationId: string;
    accountId: string;
    accountName: string;
  };
}) {
  const name = yield* AccountRepo.repoUtils.nameUtils.makeName(props.key);
  return env.ACCOUNT_REPO.getByName(name) as DurableObjectStub<
    Rpc.DurableObjectBranded & AccountRepo
  >;
});
