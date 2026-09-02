import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect, Schema, type Context } from 'effect';

import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const getSystemRepos = Effect.fn('SystemApi.getSystemRepos')(
  function* (props: {
    request: Parameters<SystemApi['getSystemRepos']>[0];
    authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
  }) {
    const { authResults: requestedAuthResults, request } = props;
    return yield* makeApiHandler({
      name: 'SystemApi.getSystemRepos',
      argsSchema: Schema.mutable(Schema.Tuple([])),
      handler: () =>
        Effect.gen(function* () {
          const authResults = yield* SystemApiAuthResults;
          const systemRepo = SystemRepo.getRepo({
            systemId: authResults.systemId,
          });
          return yield* makeAsync(() =>
            systemRepo.getRepoRegistrations({ repoType: 'SystemRepo' }),
          ).pipe(Effect.flatMap(decodeRpc));
        }).pipe(Effect.withSpan('SystemApi.getSystemRepos', { root: true })),
    })(request).pipe(
      Effect.provideService(SystemApiAuthResults, requestedAuthResults),
    );
  },
);
