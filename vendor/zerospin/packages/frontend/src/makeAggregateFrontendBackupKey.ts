import { RoutePattern } from '@remix-run/route-pattern';
import { createHref } from '@remix-run/route-pattern/href';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

export type IAggregateFrontendBackupIdentity = Readonly<{
  systemId: ISystemId;
  userId: string;
  aggregateId: IAggregateId;
  aggregateName: string;
  aggregateVersion: string;
  frontendName: string;
  aggregateFrontendLockKey: string;
}>;

export const makeAggregateFrontendBackupKey = Effect.fn(
  'makeAggregateFrontendBackupKey',
)(function* (
  identity: IAggregateFrontendBackupIdentity,
): Effect.fn.Return<string, IAnyError> {
  return yield* Effect.try({
    try: () => {
      for (const value of [
        identity.systemId,
        identity.userId,
        identity.aggregateId,
        identity.aggregateName,
        identity.aggregateVersion,
        identity.frontendName,
        identity.aggregateFrontendLockKey,
      ]) {
        // URL normalization must not erase an identity segment or its bytes.
        if (
          value === '' ||
          value === '.' ||
          value === '..' ||
          [...value].some(
            character =>
              character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
          ) ||
          !value.isWellFormed()
        ) {
          throw new Error('Invalid backup identity segment');
        }
      }
      if (!/^[a-f0-9]{64}$/.test(identity.aggregateFrontendLockKey)) {
        throw new Error(
          'The frontend lock key must be a complete SHA-256 digest',
        );
      }
      const route = RoutePattern.parse(
        '/zerospin/:systemId/:userId/aggregate/:aggregateName/:aggregateVersion/:aggregateId/:frontendName/:aggregateFrontendLockKey/backup.sqlite3',
      );
      // IDBBatchAtomicVFS uses URL.pathname as its logical filename too.
      return new URL(createHref(route, identity), 'file:///').pathname;
    },
    catch: ZerospinError.catch({
      code: 'aggregate-frontend-backup-key-failed',
      message: 'Invalid aggregate frontend backup identity',
    }),
  });
});
