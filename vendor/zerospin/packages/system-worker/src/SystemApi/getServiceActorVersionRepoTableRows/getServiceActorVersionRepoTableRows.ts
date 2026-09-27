import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { IRepoTableData } from '@zerospin/core/system/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, type IZerospinErrorJson } from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import { Effect, Schema, type Context } from 'effect';

import { ServiceActorVersionRepo } from '../../ServiceActorVersionRepo/ServiceActorVersionRepo.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

/*
 * SystemApi exposes registered ServiceActorVersionRepo tables to secret-key
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
export const getServiceActorVersionRepoTableRows = Effect.fn(
  'SystemApi.getServiceActorVersionRepoTableRows',
)(function* (props: {
  request: Parameters<SystemApi['getServiceActorVersionRepoTableRows']>[0];
  authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
}) {
  const { request, authResults } = props;

  // 1 — decode repoName and tableName through the linked SystemApi handler
  return yield* makeApiHandler({
    name: 'SystemApi.getServiceActorVersionRepoTableRows',
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

        // 3 — query SystemRepo for ServiceActorVersionRepo registrations
        const registrations = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            repoType: 'ServiceActorVersionRepo',
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
              message: `ServiceActorVersionRepo "${repoName}" is not registered`,
              extra: {
                repoName,
                repoType: 'ServiceActorVersionRepo',
              },
            }),
          );
        }

        // 5 — parse owner fields from repoName and bind systemId from SystemApi
        const key =
          yield* ServiceActorVersionRepo.fixedDORepoConfig.nameUtils.parseName(
            repoName,
          );
        const repo = yield* ServiceActorVersionRepo.getRepo({
          key: {
            systemId: authResults.systemId,
            serviceName: key.serviceName,
            serviceVersion: key.serviceVersion,
            actorPath: key.actorPath,
            actorName: key.actorName,
            actorVersion: key.actorVersion,
          },
        });

        // 6 — decode getRepoTableRows; the Repo owns table-name validation
        return yield* makeAsync<
          IRpcEnvelope<IRepoTableData, IZerospinErrorJson>
        >(() => repo.getRepoTableRows({ tableName })).pipe(
          Effect.flatMap(envelope => readRpcEnvelope(envelope)),
        );
      }).pipe(
        Effect.withSpan('SystemApi.getServiceActorVersionRepoTableRows', {
          root: true,
        }),
      ),
  })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
});
