import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { AggregateCommandChain } from '../AggregateCommandChain.js';

export const getAggregateCommandChain = Effect.fn('getAggregateCommandChain')(
  function* (props: {
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
    };
  }) {
    const name =
      yield* AggregateCommandChain.fixedDORepoConfig.nameUtils.makeName(
        props.key,
      );
    return env.AGGREGATE_COMMAND_CHAIN.getByName(name);
  },
);
