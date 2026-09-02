import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { ServiceCommandChain } from '../ServiceCommandChain.js';

export const getServiceCommandChain = Effect.fn('getServiceCommandChain')(
  function* (props: { key: { systemId: string; serviceName: string } }) {
    const name =
      yield* ServiceCommandChain.fixedDORepoConfig.nameUtils.makeName(
        props.key,
      );
    return env.SERVICE_COMMAND_CHAIN.getByName(name);
  },
);
