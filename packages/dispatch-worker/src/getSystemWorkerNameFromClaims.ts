import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { ICloudApiKeyIdentity } from './CloudApiKeyJwtClaimsSchema';
import { makeSystemWorkerName } from './makeSystemWorkerName';

export const getSystemWorkerNameFromClaims = Effect.fn(
  'getSystemWorkerNameFromClaims',
)(function* (
  claims: ICloudApiKeyIdentity,
): Effect.fn.Return<string, IAnyError> {
  switch (claims.systemEnvironmentId) {
    case 'dev':
      return makeSystemWorkerName({
        systemId: claims.systemId,
        instanceId: claims.clerkUserId,
      });
    case 'production':
      return makeSystemWorkerName({
        systemId: claims.systemId,
        instanceId: 'production',
      });
    default:
      return yield* new ZerospinError({
        code: 'unsupported-system-environment-id',
        message: 'Unsupported system environment',
      });
  }
});
