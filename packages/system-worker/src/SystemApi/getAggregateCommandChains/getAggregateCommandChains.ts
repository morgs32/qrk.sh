import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect, Schema, type Context } from 'effect';

import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const getAggregateCommandChains = Effect.fn(
  'SystemApi.getAggregateCommandChains',
)(function* (props: {
  request: Parameters<SystemApi['getAggregateCommandChains']>[0];
  authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
}) {
  const { authResults: requestedAuthResults, request } = props;
  return yield* makeApiHandler({
    name: 'SystemApi.getAggregateCommandChains',
    argsSchema: Schema.mutable(Schema.Tuple([])),
    handler: () =>
      Effect.gen(function* () {
        const authResults = yield* SystemApiAuthResults;
        const systemRepo = SystemRepo.getRepo({
          systemId: authResults.systemId,
        });
        return yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({ repoType: 'AggregateCommandChain' }),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(
        Effect.withSpan('SystemApi.getAggregateCommandChains', { root: true }),
      ),
  })(request).pipe(
    Effect.provideService(SystemApiAuthResults, requestedAuthResults),
  );
});
