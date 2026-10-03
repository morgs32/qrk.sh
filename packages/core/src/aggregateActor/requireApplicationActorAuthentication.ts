import { makeZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { IAggregateAuthentication } from '../identity/types.ts';

export const requireApplicationActorAuthentication = Effect.fn(
  'requireApplicationActorAuthentication',
)(function* (policy: IAggregateAuthentication) {
  if (policy === 'system') {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'system-actor-application-access-forbidden',
        message: 'System-only actors require administrative access',
      }),
    );
  }
  return policy;
});
