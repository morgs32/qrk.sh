import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect, Schema, type Context } from 'effect';

import {
  makeApiHandler,
  SystemApiAuthResults,
  SystemWorkerApi,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const getAggregateRepoTableRows = Effect.fn(
  'SystemApi.getAggregateRepoTableRows',
)(function* (props: {
  request: Parameters<SystemApi['getAggregateRepoTableRows']>[0];
  authResults: Context.Tag.Service<typeof SystemApiAuthResults>;
}) {
  return yield* makeApiHandler({
    name: 'SystemApi.getAggregateRepoTableRows',
    argsSchema: Schema.mutable(
      Schema.Tuple(
        Schema.Struct({
          repoName: Schema.String,
          tableName: Schema.String,
        }),
      ),
    ),
    handler: props =>
      Effect.gen(function* () {
        const authResults = yield* SystemApiAuthResults;
        const systemWorker = yield* SystemWorkerApi;
        const encoded = yield* makeAsync(() =>
          systemWorker.getAggregateRepoTableRows({
            generationId: authResults.generationId,
            repoName: props.repoName,
            tableName: props.tableName,
          }),
        );
        return yield* decodeRpc(encoded);
      }).pipe(
        Effect.withSpan('SystemApi.getAggregateRepoTableRows', { root: true }),
      ),
  })(props.request).pipe(
    Effect.provideService(SystemApiAuthResults, props.authResults),
  );
});
