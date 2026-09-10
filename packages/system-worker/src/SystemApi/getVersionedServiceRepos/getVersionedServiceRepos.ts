import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect, Schema, type Context } from 'effect';

import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

/*
 * SystemApi lists VersionedServiceRepo instances recorded in its deployment
 * catalog. Inspection reads registrations from SystemRepo instead of
 * enumerating the Durable Object namespace.
 *
 * 1. Capture the capability and request.
 * 2. Validate the empty argument tuple.
 * 3. Read the bound deployment identity.
 * 4. Resolve the deployment catalog.
 * 5. Return registrations for this Repo kind.
 */
export const getVersionedServiceRepos = Effect.fn(
  'SystemApi.getVersionedServiceRepos',
)(function* (props: {
  request: Parameters<SystemApi['getVersionedServiceRepos']>[0];
  authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
}) {
  // 1 — retain the systemId supplied when GatewayApi granted SystemApi
  const { authResults: requestedAuthResults, request } = props;

  // 2 — use the shared handler for result encoding and telemetry
  return yield* makeApiHandler({
    name: 'SystemApi.getVersionedServiceRepos',
    argsSchema: Schema.mutable(Schema.Tuple([])),
    handler: () =>
      Effect.gen(function* () {
        // 3 — obtain systemId from SystemApiAuthResults
        const authResults = yield* SystemApiAuthResults;

        // 4 — open singleton SystemRepo(systemId)
        const systemRepo = yield* SystemRepo.getRepo({
          key: {
            systemId: authResults.systemId,
          },
        });

        // 5 — decode SystemRepo.getRepoRegistrations for VersionedServiceRepo
        return yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            repoType: 'VersionedServiceRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(
        Effect.withSpan('SystemApi.getVersionedServiceRepos', {
          root: true,
        }),
      ),
  })(request).pipe(
    Effect.provideService(SystemApiAuthResults, requestedAuthResults),
  );
});
