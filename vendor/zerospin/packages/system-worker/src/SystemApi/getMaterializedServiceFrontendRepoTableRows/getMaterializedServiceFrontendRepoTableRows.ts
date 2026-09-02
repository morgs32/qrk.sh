import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IRepoTableData } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { Effect, Schema, type Context } from 'effect';

import { getMaterializedServiceFrontendRepo } from '../../MaterializedServiceFrontendRepo/getMaterializedServiceFrontendRepo/getMaterializedServiceFrontendRepo.js';
import { MaterializedServiceFrontendRepo } from '../../MaterializedServiceFrontendRepo/MaterializedServiceFrontendRepo.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const getMaterializedServiceFrontendRepoTableRows = Effect.fn(
  'SystemApi.getMaterializedServiceFrontendRepoTableRows',
)(function* (props: {
  request: Parameters<
    SystemApi['getMaterializedServiceFrontendRepoTableRows']
  >[0];
  authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
}) {
  const { request, authResults } = props;
  return yield* makeApiHandler({
    name: 'SystemApi.getMaterializedServiceFrontendRepoTableRows',
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
            repoType: 'MaterializedServiceFrontendRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `MaterializedServiceFrontendRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'MaterializedServiceFrontendRepo' },
          });
        }
        const key =
          yield* MaterializedServiceFrontendRepo.fixedDORepoConfig.nameUtils.parseName(
            repoName,
          );
        const repo = yield* getMaterializedServiceFrontendRepo({
          key: {
            systemId: authResults.systemId,
            serviceName: key.serviceName,
            userId: key.userId,
            frontendName: key.frontendName,
          },
        });
        return yield* makeAsync<IEncodedResult<IRepoTableData, IAnyErrorJson>>(
          () => repo.getRepoTableRows({ tableName }),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(
        Effect.withSpan(
          'SystemApi.getMaterializedServiceFrontendRepoTableRows',
          {
            root: true,
          },
        ),
      ),
  })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
});
