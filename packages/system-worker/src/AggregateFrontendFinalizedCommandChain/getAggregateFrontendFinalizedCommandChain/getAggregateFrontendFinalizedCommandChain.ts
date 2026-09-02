import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { AggregateFrontendFinalizedCommandChain } from '../AggregateFrontendFinalizedCommandChain.js';

export const getAggregateFrontendFinalizedCommandChain = Effect.fn(
  'getAggregateFrontendFinalizedCommandChain',
)(function* (props: {
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
}) {
  const { key } = props;
  const name =
    yield* AggregateFrontendFinalizedCommandChain.fixedDORepoConfig.nameUtils.makeName(
      key,
    );
  return env.AGGREGATE_FRONTEND_FINALIZED_COMMAND_CHAIN.getByName(
    name,
  ) as DurableObjectStub<
    Rpc.DurableObjectBranded & AggregateFrontendFinalizedCommandChain
  >;
});
