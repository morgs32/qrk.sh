import type { ISessionId } from '@zerospin/core/session/types';
import { ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { OpfsBackupLeaderApi } from '../OpfsBackupLeaderApi.ts';

export const listSessionBackups = Effect.fn(
  'OpfsBackupLeaderApi.listSessionBackups',
)(function* (props: {
  api: OpfsBackupLeaderApi;
  backupClientId: number;
  backupKey: string;
}) {
  return yield* Effect.tryPromise({
    try: async () => {
      if (!/^[a-f0-9]{64}$/.test(props.backupKey)) {
        throw new Error('Invalid OPFS backup key');
      }

      try {
        const root = await navigator.storage.getDirectory();
        const zerospin = await root.getDirectoryHandle('zerospin');
        const directory = await zerospin.getDirectoryHandle(props.backupKey);
        const sessionIds: ISessionId[] = [];
        for await (const [name, handle] of directory.entries()) {
          if (handle.kind !== 'file' || !name.endsWith('.sqlite3')) continue;
          sessionIds.push(
            Schema.decodeUnknownSync(
              Schema.declare(
                (input: unknown): input is ISessionId =>
                  typeof input === 'string' && input.startsWith('sesn_'),
              ),
            )(name.slice(0, -'.sqlite3'.length)),
          );
        }
        return sessionIds.sort();
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'NotFoundError') {
          return [];
        }
        throw cause;
      }
    },
    catch: ZerospinError.catch({
      code: 'opfs-backup-list-failed',
      message: 'Failed to list OPFS session backups',
    }),
  });
});
