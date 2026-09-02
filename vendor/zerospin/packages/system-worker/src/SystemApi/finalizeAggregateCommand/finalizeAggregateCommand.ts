import { makeAsync } from '@zerospin/core/async/makeAsync';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect, Schema, type Context } from 'effect';

import { AggregateCommandChain } from '../../AggregateCommandChain/AggregateCommandChain.js';
import { getAggregateCommandChain } from '../../AggregateCommandChain/getAggregateCommandChain/getAggregateCommandChain.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const finalizeAggregateCommand = Effect.fn(
  'SystemApi.finalizeAggregateCommand',
)(function* (props: {
  request: Parameters<SystemApi['finalizeAggregateCommand']>[0];
  authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
}) {
  const { authResults: requestedAuthResults, request } = props;
  return yield* makeApiHandler({
    name: 'SystemApi.finalizeAggregateCommand',
    argsSchema: Schema.mutable(Schema.Tuple([EncodedAggregateCommandSchema])),
    handler: command =>
      Effect.gen(function* () {
        const authResults = yield* SystemApiAuthResults;
        const chain = yield* getAggregateCommandChain({
          key: {
            systemId: authResults.systemId,
            aggregateId: command.aggregateId,
            aggregateName: command.aggregateName,
          },
        });
        return yield* makeAsync<
          Awaited<ReturnType<AggregateCommandChain['finalizeAggregateCommand']>>
        >(() => chain.finalizeAggregateCommand({ command })).pipe(
          Effect.flatMap(decodeRpc),
        );
      }).pipe(
        Effect.withSpan('SystemApi.finalizeAggregateCommand', { root: true }),
      ),
  })(request).pipe(
    Effect.provideService(SystemApiAuthResults, requestedAuthResults),
  );
});
