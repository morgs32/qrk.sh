import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { Effect, Schema, type Context } from 'effect';

import { ServiceChain } from '../../ServiceChain/ServiceChain.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

/*
 * SystemApi exposes registered ServiceChain tables to secret-key
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
export const getServiceChainTableRows = Effect.fn(
  'SystemApi.getServiceChainTableRows',
)(function* (props: {
  request: Parameters<SystemApi['getServiceChainTableRows']>[0];
  authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
}) {
  const { request, authResults } = props;

  // 1 — decode repoName and tableName through the linked SystemApi handler
  return yield* makeApiHandler({
    name: 'SystemApi.getServiceChainTableRows',
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

        // 3 — query SystemRepo for ServiceChain registrations
        const registrations = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({ repoType: 'ServiceChain' }),
        ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));

        // 4 — return repo-explorer-repo-not-found before opening the requested Repo
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'repo-explorer-repo-not-found',
              message: `ServiceChain "${repoName}" is not registered`,
              extra: { repoName, repoType: 'ServiceChain' },
            }),
          );
        }

        // 5 — parse owner fields from repoName and bind systemId from SystemApi
        const key =
          yield* ServiceChain.fixedDORepoConfig.nameUtils.parseName(repoName);
        const repo = yield* ServiceChain.getRepo({
          key: {
            systemId: authResults.systemId,
            serviceName: key.serviceName,
          },
        });

        // 6 — decode getRepoTableRows; the Repo owns table-name validation
        return yield* makeAsync<
          Awaited<ReturnType<ServiceChain['getRepoTableRows']>>
        >(() => repo.getRepoTableRows({ tableName })).pipe(
          Effect.flatMap(envelope => readRpcEnvelope(envelope)),
        );
      }).pipe(
        Effect.withSpan('SystemApi.getServiceChainTableRows', {
          root: true,
        }),
      ),
  })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
});
