import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IRepoTableData } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { Effect, Schema, type Context } from 'effect';

import { getMaterializedAggregateFrontendRepo } from '../../MaterializedAggregateFrontendRepo/getMaterializedAggregateFrontendRepo/getMaterializedAggregateFrontendRepo.js';
import { MaterializedAggregateFrontendRepo } from '../../MaterializedAggregateFrontendRepo/MaterializedAggregateFrontendRepo.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const getMaterializedAggregateFrontendRepoTableRows = Effect.fn(
  'SystemApi.getMaterializedAggregateFrontendRepoTableRows',
)(function* (props: {
  request: Parameters<
    SystemApi['getMaterializedAggregateFrontendRepoTableRows']
  >[0];
  authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
}) {
  const { request, authResults } = props;
  return yield* makeApiHandler({
    name: 'SystemApi.getMaterializedAggregateFrontendRepoTableRows',
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
            repoType: 'MaterializedAggregateFrontendRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `MaterializedAggregateFrontendRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'MaterializedAggregateFrontendRepo' },
          });
        }
        const key =
          yield* MaterializedAggregateFrontendRepo.fixedDORepoConfig.nameUtils.parseName(
            repoName,
          );
        const repo = yield* getMaterializedAggregateFrontendRepo({
          key: {
            systemId: authResults.systemId,
            aggregateId: key.aggregateId,
            aggregateName: key.aggregateName,
            userId: key.userId,
            frontendName: key.frontendName,
          },
        });
        return yield* makeAsync<IEncodedResult<IRepoTableData, IAnyErrorJson>>(
          () => repo.getRepoTableRows({ tableName }),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(
        Effect.withSpan(
          'SystemApi.getMaterializedAggregateFrontendRepoTableRows',
          {
            root: true,
          },
        ),
      ),
  })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
});
