import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { AggregateFrontendPushedCommandChain } from '../AggregateFrontendPushedCommandChain.js';

export const getAggregateFrontendPushedCommandChain = Effect.fn(
  'getAggregateFrontendPushedCommandChain',
)(function* (props: {
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
}) {
  const name =
    yield* AggregateFrontendPushedCommandChain.fixedDORepoConfig.nameUtils.makeName(
      props.key,
    );
  return env.AGGREGATE_FRONTEND_PUSHED_COMMAND_CHAIN.getByName(name);
});
