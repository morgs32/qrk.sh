import { RoutePattern } from '@remix-run/route-pattern';
import { createHref } from '@remix-run/route-pattern/href';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

export type IStandaloneFrontendBackupIdentity = Readonly<{
  key: string;
  frontendName: string;
  frontendLockKey: string;
}>;

export const makeStandaloneFrontendBackupKey = Effect.fn(
  'makeStandaloneFrontendBackupKey',
)(function* (
  identity: IStandaloneFrontendBackupIdentity,
): Effect.fn.Return<string, IAnyError> {
  return yield* Effect.try({
    try: () => {
      for (const value of [
        identity.key,
        identity.frontendName,
        identity.frontendLockKey,
      ]) {
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
      if (!/^[a-f0-9]{64}$/.test(identity.frontendLockKey)) {
        throw new Error(
          'The frontend lock key must be a complete SHA-256 digest',
        );
      }
      const route = RoutePattern.parse(
        '/zerospin/standalone/:key/:frontendName/:frontendLockKey/backup.sqlite3',
      );
      return new URL(createHref(route, identity), 'file:///').pathname;
    },
    catch: ZerospinError.catch({
      code: 'standalone-frontend-backup-key-failed',
      message: 'Invalid standalone frontend backup identity',
    }),
  });
});
