import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { FixtureRepo } from '../FixtureRepo.js';

export const getFixtureRepo = Effect.fn('getFixtureRepo')(function* (props: {
  key: {
    scope: string;
    id: string;
  };
}) {
  const name = yield* FixtureRepo.repoUtils.nameUtils.makeName(props.key);
  return env.FIXTURE_REPO.getByName(name) as DurableObjectStub<
    Rpc.DurableObjectBranded & FixtureRepo
  >;
});
