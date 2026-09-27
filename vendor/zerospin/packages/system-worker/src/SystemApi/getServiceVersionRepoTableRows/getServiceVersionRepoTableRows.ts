import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { Effect, Schema, type Context } from 'effect';

import { ServiceVersionRepo } from '../../ServiceVersionRepo/ServiceVersionRepo.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

/*
 * SystemApi exposes registered ServiceVersionRepo tables to secret-key
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
export const getServiceVersionRepoTableRows = Effect.fn(
  'SystemApi.getServiceVersionRepoTableRows',
)(function* (props: {
  request: Parameters<SystemApi['getServiceVersionRepoTableRows']>[0];
  authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
}) {
  const { request, authResults } = props;

  // 1 — decode repoName and tableName through the linked SystemApi handler
  return yield* makeApiHandler({
    name: 'SystemApi.getServiceVersionRepoTableRows',
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

        // 3 — query SystemRepo for ServiceVersionRepo registrations
        const registrations = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            repoType: 'ServiceVersionRepo',
          }),
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
              message: `ServiceVersionRepo "${repoName}" is not registered`,
              extra: { repoName, repoType: 'ServiceVersionRepo' },
            }),
          );
        }

        // 5 — parse owner fields from repoName and bind systemId from SystemApi
        const key =
          yield* ServiceVersionRepo.fixedDORepoConfig.nameUtils.parseName(
            repoName,
          );
        const repo = yield* ServiceVersionRepo.getRepo({
          key: {
            systemId: authResults.systemId,
            serviceName: key.serviceName,
            serviceVersion: key.serviceVersion,
          },
        });

        // 6 — decode getRepoTableRows; the Repo owns table-name validation
        return yield* makeAsync<
          Awaited<ReturnType<ServiceVersionRepo['getRepoTableRows']>>
        >(() => repo.getRepoTableRows({ tableName })).pipe(
          Effect.flatMap(envelope => readRpcEnvelope(envelope)),
        );
      }).pipe(
        Effect.withSpan('SystemApi.getServiceVersionRepoTableRows', {
          root: true,
        }),
      ),
  })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
});
