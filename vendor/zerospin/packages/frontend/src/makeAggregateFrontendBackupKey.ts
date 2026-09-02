import type { IAggregateId } from '@zerospin/core/models/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

export type IAggregateFrontendBackupIdentity = Readonly<{
  systemId: ISystemId;
  userId: string;
  aggregateId: IAggregateId;
  aggregateName: string;
  frontendName: string;
  aggregateFrontendLockKey: string;
}>;

export const makeAggregateFrontendBackupKey = Effect.fn(
  'makeAggregateFrontendBackupKey',
)(function* (
  identity: IAggregateFrontendBackupIdentity,
): Effect.fn.Return<string, IAnyError> {
  const digest = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(
          JSON.stringify([
            'aggregate',
            identity.systemId,
            identity.userId,
            identity.aggregateId,
            identity.aggregateName,
            identity.frontendName,
            identity.aggregateFrontendLockKey,
          ]),
        ),
      ),
    catch: ZerospinError.catch({
      code: 'aggregate-frontend-backup-key-failed',
      message: 'Failed to hash the aggregate frontend backup identity',
    }),
  });

  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
});
