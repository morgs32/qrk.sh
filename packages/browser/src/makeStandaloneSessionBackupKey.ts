import { RoutePattern } from '@remix-run/route-pattern';
import { createHref } from '@remix-run/route-pattern/href';
import { catchZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

export type IStandaloneSessionBackupIdentity = Readonly<{
  key: string;
  sessionName: string;
  sessionLockKey: string;
}>;

export const makeStandaloneSessionBackupKey = Effect.fn(
  'makeStandaloneSessionBackupKey',
)(function* (
  identity: IStandaloneSessionBackupIdentity,
): Effect.fn.Return<string, IAnyError> {
  return yield* Effect.try({
    try: () => {
      for (const value of [
        identity.key,
        identity.sessionName,
        identity.sessionLockKey,
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
      if (!/^[a-f0-9]{64}$/.test(identity.sessionLockKey)) {
        throw new Error(
          'The definition lock key must be a complete SHA-256 digest',
        );
      }
      const route = RoutePattern.parse(
        '/zerospin/standalone/:key/:sessionName/:sessionLockKey/backup.sqlite3',
      );
      return new URL(createHref(route, identity), 'file:///').pathname;
    },
    catch: catchZerospinError({
      code: 'standalone-session-backup-key-failed',
      message: 'Invalid standalone session backup identity',
    }),
  });
});
