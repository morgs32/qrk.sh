import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ZerospinError } from '@zerospin/error';
import { Effect, Schema, type Context } from 'effect';

import { getMaterializedAggregateRepo } from '../../MaterializedAggregateRepo/getMaterializedAggregateRepo/getMaterializedAggregateRepo.js';
import { MaterializedAggregateRepo } from '../../MaterializedAggregateRepo/MaterializedAggregateRepo.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const getMaterializedAggregateRepoTableRows = Effect.fn(
  'SystemApi.getMaterializedAggregateRepoTableRows',
)(function* (props: {
  request: Parameters<SystemApi['getMaterializedAggregateRepoTableRows']>[0];
  authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
}) {
  const { request, authResults } = props;
  return yield* makeApiHandler({
    name: 'SystemApi.getMaterializedAggregateRepoTableRows',
    argsSchema: Schema.mutable(
      Schema.Tuple([
        Schema.Struct({
          repoName: Schema.String,
          tableName: Schema.String,
        }),
      ]),
    ),
    handler: handlerProps =>
      Effect.gen(function* () {
        const { repoName, tableName } = handlerProps;
        const authResults = yield* SystemApiAuthResults;
        const systemRepo = SystemRepo.getRepo({
          systemId: authResults.systemId,
        });
        const registrations = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            repoType: 'MaterializedAggregateRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `MaterializedAggregateRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'MaterializedAggregateRepo' },
          });
        }
        const key =
          yield* MaterializedAggregateRepo.fixedDORepoConfig.nameUtils.parseName(
            repoName,
          );
        const repo = yield* getMaterializedAggregateRepo({
          key: {
            systemId: authResults.systemId,
            aggregateId: key.aggregateId,
            aggregateName: key.aggregateName,
          },
        });
        return yield* makeAsync<
          Awaited<ReturnType<MaterializedAggregateRepo['getRepoTableRows']>>
        >(() => repo.getRepoTableRows({ tableName })).pipe(
          Effect.flatMap(decodeRpc),
        );
      }).pipe(
        Effect.withSpan('SystemApi.getMaterializedAggregateRepoTableRows', {
          root: true,
        }),
      ),
  })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
});
