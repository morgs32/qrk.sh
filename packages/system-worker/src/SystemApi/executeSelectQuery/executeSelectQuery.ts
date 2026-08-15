import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect, Schema, type Context } from 'effect';

import {
  makeApiHandler,
  SystemApiAuthResults,
  SystemWorkerApi,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const executeSelectQuery = Effect.fn('SystemApi.executeSelectQuery')(
  function* (props: {
    request: Parameters<SystemApi['executeSelectQuery']>[0];
    authResults: Context.Tag.Service<typeof SystemApiAuthResults>;
  }) {
    return yield* makeApiHandler({
      name: 'SystemApi.executeSelectQuery',
      argsSchema: Schema.mutable(
        Schema.Tuple(
          Schema.Struct({
            aggregateId: makeAbbreviationIdSchema('acct'),
            aggregateName: Schema.String,
            query: Schema.Struct({
              method: Schema.Literal('all', 'get'),
              params: Schema.mutable(Schema.Array(Schema.Unknown)),
              rawSql: Schema.String,
            }),
          }),
        ),
      ),
      handler: props =>
        Effect.gen(function* () {
          const authResults = yield* SystemApiAuthResults;
          const systemWorker = yield* SystemWorkerApi;
          const encoded = yield* makeAsync(() =>
            systemWorker.executeSelectQuery({
              aggregateId: props.aggregateId,
              aggregateName: props.aggregateName,
              generationId: authResults.generationId,
              query: props.query,
            }),
          );
          return yield* decodeRpc(encoded);
        }).pipe(
          Effect.withSpan('SystemApi.executeSelectQuery', { root: true }),
        ),
    })(props.request).pipe(
      Effect.provideService(SystemApiAuthResults, props.authResults),
    );
  },
);
