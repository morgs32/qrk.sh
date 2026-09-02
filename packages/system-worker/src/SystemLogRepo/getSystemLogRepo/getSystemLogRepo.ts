import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { SystemLogRepo } from '../SystemLogRepo.js';

export const getSystemLogRepo = Effect.fn('getSystemLogRepo')(
  function* (props: {
    key: {
      systemId: string;
    };
  }) {
    const { key } = props;
    const name = yield* SystemLogRepo.fixedDORepoConfig.nameUtils.makeName(key);
    return env.SYSTEM_LOG_REPO.getByName(name) as DurableObjectStub<
      Rpc.DurableObjectBranded & SystemLogRepo
    >;
  },
);
