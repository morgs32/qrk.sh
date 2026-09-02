import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { ServiceFrontendFinalizedCommandChain } from '../ServiceFrontendFinalizedCommandChain.js';

export const getServiceFrontendFinalizedCommandChain = Effect.fn(
  'getServiceFrontendFinalizedCommandChain',
)(function* (props: {
  key: {
    systemId: string;
    serviceName: string;
    userId: string;
    frontendName: string;
  };
}) {
  const { key } = props;
  const name =
    yield* ServiceFrontendFinalizedCommandChain.fixedDORepoConfig.nameUtils.makeName(
      key,
    );
  return env.SERVICE_FRONTEND_FINALIZED_COMMAND_CHAIN.getByName(
    name,
  ) as DurableObjectStub<
    Rpc.DurableObjectBranded & ServiceFrontendFinalizedCommandChain
  >;
});
