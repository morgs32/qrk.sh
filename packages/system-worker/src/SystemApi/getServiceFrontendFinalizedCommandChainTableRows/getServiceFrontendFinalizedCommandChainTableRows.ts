import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IRepoTableData } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { Effect, Schema, type Context } from 'effect';

import { getServiceFrontendFinalizedCommandChain } from '../../ServiceFrontendFinalizedCommandChain/getServiceFrontendFinalizedCommandChain/getServiceFrontendFinalizedCommandChain.js';
import { ServiceFrontendFinalizedCommandChain } from '../../ServiceFrontendFinalizedCommandChain/ServiceFrontendFinalizedCommandChain.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const getServiceFrontendFinalizedCommandChainTableRows = Effect.fn(
  'SystemApi.getServiceFrontendFinalizedCommandChainTableRows',
)(function* (props: {
  request: Parameters<
    SystemApi['getServiceFrontendFinalizedCommandChainTableRows']
  >[0];
  authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
}) {
  const { request, authResults } = props;
  return yield* makeApiHandler({
    name: 'SystemApi.getServiceFrontendFinalizedCommandChainTableRows',
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
            repoType: 'ServiceFrontendFinalizedCommandChain',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `ServiceFrontendFinalizedCommandChain "${repoName}" is not registered`,
            extra: {
              repoName,
              repoType: 'ServiceFrontendFinalizedCommandChain',
            },
          });
        }
        const key =
          yield* ServiceFrontendFinalizedCommandChain.fixedDORepoConfig.nameUtils.parseName(
            repoName,
          );
        const repo = yield* getServiceFrontendFinalizedCommandChain({
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
          'SystemApi.getServiceFrontendFinalizedCommandChainTableRows',
          {
            root: true,
          },
        ),
      ),
  })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
});
