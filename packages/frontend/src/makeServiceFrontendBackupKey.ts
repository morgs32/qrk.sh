import { RoutePattern } from '@remix-run/route-pattern';
import { createHref } from '@remix-run/route-pattern/href';
import type { ISystemId } from '@zerospin/core/system/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

export type IServiceFrontendBackupIdentity = Readonly<{
  systemId: ISystemId;
  userId: string;
  serviceName: string;
  serviceVersion: string;
  frontendName: string;
  serviceFrontendLockKey: string;
}>;

export const makeServiceFrontendBackupKey = Effect.fn(
  'makeServiceFrontendBackupKey',
)(function* (
  identity: IServiceFrontendBackupIdentity,
): Effect.fn.Return<string, IAnyError> {
  return yield* Effect.try({
    try: () => {
      for (const value of [
        identity.systemId,
        identity.userId,
        identity.serviceName,
        identity.serviceVersion,
        identity.frontendName,
        identity.serviceFrontendLockKey,
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
      if (!/^[a-f0-9]{64}$/.test(identity.serviceFrontendLockKey)) {
        throw new Error(
          'The frontend lock key must be a complete SHA-256 digest',
        );
      }
      const route = RoutePattern.parse(
        '/zerospin/:systemId/:userId/service/:serviceName/:serviceVersion/:frontendName/:serviceFrontendLockKey/backup.sqlite3',
      );
      // IDBBatchAtomicVFS uses URL.pathname as its logical filename too.
      return new URL(createHref(route, identity), 'file:///').pathname;
    },
    catch: ZerospinError.catch({
      code: 'service-frontend-backup-key-failed',
      message: 'Invalid service frontend backup identity',
    }),
  });
});
