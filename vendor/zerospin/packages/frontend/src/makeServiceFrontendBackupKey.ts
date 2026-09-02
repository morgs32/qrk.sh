import type { ISystemId } from '@zerospin/core/system/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

export type IServiceFrontendBackupIdentity = Readonly<{
  systemId: ISystemId;
  userId: string;
  serviceName: string;
  frontendName: string;
  serviceFrontendLockKey: string;
}>;

export const makeServiceFrontendBackupKey = Effect.fn(
  'makeServiceFrontendBackupKey',
)(function* (
  identity: IServiceFrontendBackupIdentity,
): Effect.fn.Return<string, IAnyError> {
  const digest = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(
          JSON.stringify([
            'service',
            identity.systemId,
            identity.userId,
            identity.serviceName,
            identity.frontendName,
            identity.serviceFrontendLockKey,
          ]),
        ),
      ),
    catch: ZerospinError.catch({
      code: 'service-frontend-backup-key-failed',
      message: 'Failed to hash the service frontend backup identity',
    }),
  });

  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
});
