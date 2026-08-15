import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect, Schema, type Context } from 'effect';

import {
  makeApiHandler,
  SystemApiAuthResults,
  SystemWorkerApi,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const getServiceRepoTableRows = Effect.fn(
  'SystemApi.getServiceRepoTableRows',
)(function* (props: {
  request: Parameters<SystemApi['getServiceRepoTableRows']>[0];
  authResults: Context.Tag.Service<typeof SystemApiAuthResults>;
}) {
  return yield* makeApiHandler({
    name: 'SystemApi.getServiceRepoTableRows',
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
          systemWorker.getServiceRepoTableRows({
            generationId: authResults.generationId,
            repoName: props.repoName,
            tableName: props.tableName,
          }),
        );
        return yield* decodeRpc(encoded);
      }).pipe(
        Effect.withSpan('SystemApi.getServiceRepoTableRows', { root: true }),
      ),
  })(props.request).pipe(
    Effect.provideService(SystemApiAuthResults, props.authResults),
  );
});
