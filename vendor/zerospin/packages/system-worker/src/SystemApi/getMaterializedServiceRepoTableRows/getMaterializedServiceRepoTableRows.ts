import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ZerospinError } from '@zerospin/error';
import { Effect, Schema, type Context } from 'effect';

import { getMaterializedServiceRepo } from '../../MaterializedServiceRepo/getMaterializedServiceRepo/getMaterializedServiceRepo.js';
import { MaterializedServiceRepo } from '../../MaterializedServiceRepo/MaterializedServiceRepo.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const getMaterializedServiceRepoTableRows = Effect.fn(
  'SystemApi.getMaterializedServiceRepoTableRows',
)(function* (props: {
  request: Parameters<SystemApi['getMaterializedServiceRepoTableRows']>[0];
  authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
}) {
  const { request, authResults } = props;
  return yield* makeApiHandler({
    name: 'SystemApi.getMaterializedServiceRepoTableRows',
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
            repoType: 'MaterializedServiceRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `MaterializedServiceRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'MaterializedServiceRepo' },
          });
        }
        const key =
          yield* MaterializedServiceRepo.fixedDORepoConfig.nameUtils.parseName(
            repoName,
          );
        const repo = yield* getMaterializedServiceRepo({
          key: {
            systemId: authResults.systemId,
            serviceName: key.serviceName,
          },
        });
        return yield* makeAsync<
          Awaited<ReturnType<MaterializedServiceRepo['getRepoTableRows']>>
        >(() => repo.getRepoTableRows({ tableName })).pipe(
          Effect.flatMap(decodeRpc),
        );
      }).pipe(
        Effect.withSpan('SystemApi.getMaterializedServiceRepoTableRows', {
          root: true,
        }),
      ),
  })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
});
