import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { SystemLogRepo } from '../SystemLogRepo.js';

export const getSystemLogRepo = Effect.fn('getSystemLogRepo')(function* (props: {
  key: {
    generationId: string;
  };
}) {
  const name = yield* SystemLogRepo.repoUtils.nameUtils.makeName(props.key);
  const systemLogRepo: DurableObjectStub<
    Rpc.DurableObjectBranded & SystemLogRepo
  > = env.SYSTEM_LOG_REPO.getByName(name);
  return systemLogRepo;
});
