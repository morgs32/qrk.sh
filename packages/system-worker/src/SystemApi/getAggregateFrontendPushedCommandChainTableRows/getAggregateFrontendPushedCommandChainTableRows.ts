import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IRepoTableData } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { Effect, Schema, type Context } from 'effect';

import { AggregateFrontendPushedCommandChain } from '../../AggregateFrontendPushedCommandChain/AggregateFrontendPushedCommandChain.js';
import { getAggregateFrontendPushedCommandChain } from '../../AggregateFrontendPushedCommandChain/getAggregateFrontendPushedCommandChain/getAggregateFrontendPushedCommandChain.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const getAggregateFrontendPushedCommandChainTableRows = Effect.fn(
  'SystemApi.getAggregateFrontendPushedCommandChainTableRows',
)(function* (props: {
  request: Parameters<
    SystemApi['getAggregateFrontendPushedCommandChainTableRows']
  >[0];
  authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
}) {
  const { request, authResults } = props;
  return yield* makeApiHandler({
    name: 'SystemApi.getAggregateFrontendPushedCommandChainTableRows',
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
            repoType: 'AggregateFrontendPushedCommandChain',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `AggregateFrontendPushedCommandChain "${repoName}" is not registered`,
            extra: {
              repoName,
              repoType: 'AggregateFrontendPushedCommandChain',
            },
          });
        }
        const key =
          yield* AggregateFrontendPushedCommandChain.fixedDORepoConfig.nameUtils.parseName(
            repoName,
          );
        const repo = yield* getAggregateFrontendPushedCommandChain({
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
          'SystemApi.getAggregateFrontendPushedCommandChainTableRows',
          { root: true },
        ),
      ),
  })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
});
