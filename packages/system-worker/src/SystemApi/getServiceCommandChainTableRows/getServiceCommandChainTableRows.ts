import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ZerospinError } from '@zerospin/error';
import { Effect, Schema, type Context } from 'effect';

import { getServiceCommandChain } from '../../ServiceCommandChain/getServiceCommandChain/getServiceCommandChain.js';
import { ServiceCommandChain } from '../../ServiceCommandChain/ServiceCommandChain.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const getServiceCommandChainTableRows = Effect.fn(
  'SystemApi.getServiceCommandChainTableRows',
)(function* (props: {
  request: Parameters<SystemApi['getServiceCommandChainTableRows']>[0];
  authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
}) {
  const { request, authResults } = props;
  return yield* makeApiHandler({
    name: 'SystemApi.getServiceCommandChainTableRows',
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
          systemRepo.getRepoRegistrations({ repoType: 'ServiceCommandChain' }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `ServiceCommandChain "${repoName}" is not registered`,
            extra: { repoName, repoType: 'ServiceCommandChain' },
          });
        }
        const key =
          yield* ServiceCommandChain.fixedDORepoConfig.nameUtils.parseName(
            repoName,
          );
        const repo = yield* getServiceCommandChain({
          key: {
            systemId: authResults.systemId,
            serviceName: key.serviceName,
          },
        });
        return yield* makeAsync<
          Awaited<ReturnType<ServiceCommandChain['getRepoTableRows']>>
        >(() => repo.getRepoTableRows({ tableName })).pipe(
          Effect.flatMap(decodeRpc),
        );
      }).pipe(
        Effect.withSpan('SystemApi.getServiceCommandChainTableRows', {
          root: true,
        }),
      ),
  })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
});
