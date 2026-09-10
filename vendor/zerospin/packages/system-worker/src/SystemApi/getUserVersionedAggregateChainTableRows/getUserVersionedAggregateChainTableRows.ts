import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IRepoTableData } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { Effect, Schema, type Context } from 'effect';

import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import { UserVersionedAggregateChain } from '../../UserVersionedAggregateChain/UserVersionedAggregateChain.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

/*
 * SystemApi exposes registered UserVersionedAggregateChain tables to secret-key
 * inspection callers. The catalog check precedes the Repo lookup; systemId
 * comes from the granted capability, while repoName and tableName come from the request.
 *
 * 1. Validate the inspection request.
 * 2. Read the bound deployment identity.
 * 3. Load registrations for this Repo kind.
 * 4. Reject an unregistered Repo name.
 * 5. Resolve the registered physical Repo.
 * 6. Return the selected table rows.
 */
export const getUserVersionedAggregateChainTableRows = Effect.fn(
  'SystemApi.getUserVersionedAggregateChainTableRows',
)(function* (props: {
  request: Parameters<SystemApi['getUserVersionedAggregateChainTableRows']>[0];
  authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
}) {
  const { request, authResults } = props;

  // 1 — decode repoName and tableName through the linked SystemApi handler
  return yield* makeApiHandler({
    name: 'SystemApi.getUserVersionedAggregateChainTableRows',
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

        // 2 — resolve SystemRepo using capability-bound systemId
        const authResults = yield* SystemApiAuthResults;
        const systemRepo = yield* SystemRepo.getRepo({
          key: {
            systemId: authResults.systemId,
          },
        });

        // 3 — query SystemRepo for UserVersionedAggregateChain registrations
        const registrations = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            repoType: 'UserVersionedAggregateChain',
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        // 4 — return repo-explorer-repo-not-found before opening the requested Repo
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `UserVersionedAggregateChain "${repoName}" is not registered`,
            extra: {
              repoName,
              repoType: 'UserVersionedAggregateChain',
            },
          });
        }

        // 5 — parse owner fields from repoName and bind systemId from SystemApi
        const key =
          yield* UserVersionedAggregateChain.fixedDORepoConfig.nameUtils.parseName(
            repoName,
          );
        const repo = yield* UserVersionedAggregateChain.getRepo({
          key: {
            systemId: authResults.systemId,
            aggregateId: key.aggregateId,
            aggregateName: key.aggregateName,
            aggregateVersion: key.aggregateVersion,
            userId: key.userId,
          },
        });

        // 6 — decode getRepoTableRows; the Repo owns table-name validation
        return yield* makeAsync<IEncodedResult<IRepoTableData, IAnyErrorJson>>(
          () => repo.getRepoTableRows({ tableName }),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(
        Effect.withSpan('SystemApi.getUserVersionedAggregateChainTableRows', {
          root: true,
        }),
      ),
  })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
});
