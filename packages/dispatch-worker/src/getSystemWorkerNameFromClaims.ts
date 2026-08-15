import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { ICloudApiKeyJwtClaims } from './CloudApiKeyJwtClaimsSchema';
import { makeSystemWorkerName } from './makeSystemWorkerName';

export const getSystemWorkerNameFromClaims = Effect.fn(
  'getSystemWorkerNameFromClaims',
)(function* (
  claims: ICloudApiKeyJwtClaims,
): Effect.fn.Return<string, IAnyError> {
  switch (claims.systemEnvironmentId) {
    case 'dev':
      return makeSystemWorkerName({
        systemId: claims.systemId,
        systemEnvironmentId: claims.systemEnvironmentId,
        clerkUserId: claims.clerkUserId,
      });
    case 'production':
      return makeSystemWorkerName({
        systemId: claims.systemId,
        systemEnvironmentId: claims.systemEnvironmentId,
      });
    default:
      return yield* new ZerospinError({
        code: 'unsupported-system-environment-id',
        message: 'Unsupported system environment',
      });
  }
});
