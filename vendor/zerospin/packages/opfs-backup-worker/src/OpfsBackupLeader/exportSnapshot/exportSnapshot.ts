import type { ISessionId } from '@zerospin/core/session/types';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';
import * as SQLite from 'wa-sqlite';

import type { OpfsBackupLeaderApi } from '../OpfsBackupLeaderApi.ts';
import { copySqliteDatabase } from '../copySqliteDatabase/copySqliteDatabase.ts';

export const exportSnapshot = Effect.fn('OpfsBackupLeaderApi.exportSnapshot')(
  function* (props: {
    api: OpfsBackupLeaderApi;
    backupClientId: number;
    backupKey: string;
    sessionId: ISessionId;
  }) {
    if (!/^[a-f0-9]{64}$/.test(props.backupKey)) {
      return yield* new ZerospinError({
        code: 'opfs-backup-export-failed',
        message: 'Invalid OPFS backup key',
      });
    }

    const key = JSON.stringify([props.backupKey, props.sessionId]);
    let releaseAcquiredLock: (() => void) | null = null;
    if (!props.api.handles.has(key)) {
      const exists = yield* Effect.tryPromise({
        try: async () => {
          try {
            const root = await navigator.storage.getDirectory();
            const zerospin = await root.getDirectoryHandle('zerospin');
            const directory = await zerospin.getDirectoryHandle(
              props.backupKey,
            );
            await directory.getFileHandle(`${props.sessionId}.sqlite3`);
            return true;
          } catch (cause) {
            if (
              cause instanceof DOMException &&
              cause.name === 'NotFoundError'
            ) {
              return false;
            }
            throw cause;
          }
        },
        catch: ZerospinError.catch({
          code: 'opfs-backup-export-failed',
          message: 'Failed to inspect OPFS session backup',
        }),
      });
      if (!exists) return null;

      releaseAcquiredLock = yield* Effect.tryPromise({
        try: async () => {
          const acquired = Promise.withResolvers<void>();
          const lifetime = Promise.withResolvers<void>();
          void navigator.locks
            .request(
              `zerospin:opfs:${props.backupKey}:${props.sessionId}`,
              { mode: 'shared' },
              async lock => {
                if (lock === null) {
                  acquired.reject(new Error('Failed to acquire OPFS lock'));
                  return;
                }
                acquired.resolve();
                await lifetime.promise;
              },
            )
            .catch(acquired.reject);
          await acquired.promise;
          return lifetime.resolve;
        },
        catch: ZerospinError.catch({
          code: 'opfs-backup-export-failed',
          message: 'Failed to acquire OPFS backup read lock',
        }),
      });
    }

    const acquiredRelease = releaseAcquiredLock;
    return yield* props.api.semaphore.withPermits(1)(
      Effect.tryPromise({
        try: async () => {
          const retained = props.api.handles.get(key);
          if (retained !== undefined && acquiredRelease !== null) {
            acquiredRelease();
          }
          const releaseLock = retained === undefined ? acquiredRelease : null;
          let sourceDb = retained?.db ?? null;
          let destinationDb: number | null = null;
          let serializedPointer = 0;
          let schemaPointer = 0;
          let sizePointer = 0;
          try {
            if (sourceDb === null) {
              sourceDb = await props.api.sqlite3.open_v2(
                `/zerospin/${props.backupKey}/${props.sessionId}.sqlite3`,
                SQLite.SQLITE_OPEN_READWRITE,
                'opfs-coop-sync',
              );
            }
            destinationDb = await props.api.sqlite3.open_v2(':memory:');
            await Effect.runPromise(
              copySqliteDatabase({
                destinationDb,
                module: props.api.module,
                sourceDb,
              }),
            );

            schemaPointer = props.api.module._sqlite3_malloc(5);
            props.api.module.HEAPU8.set(
              new Uint8Array([109, 97, 105, 110, 0]),
              schemaPointer,
            );
            sizePointer = props.api.module._sqlite3_malloc(8);
            props.api.module.HEAPU32[sizePointer >>> 2] = 0;
            props.api.module.HEAPU32[(sizePointer >>> 2) + 1] = 0;
            serializedPointer = props.api.module._sqlite3_serialize(
              destinationDb,
              schemaPointer,
              sizePointer,
              0,
            );
            if (serializedPointer === 0) {
              throw new Error('sqlite3_serialize failed');
            }
            const sizeLow =
              props.api.module.HEAPU32[sizePointer >>> 2] ?? 0;
            const sizeHigh =
              props.api.module.HEAPU32[(sizePointer >>> 2) + 1] ?? 0;
            if (sizeHigh !== 0) {
              throw new Error('SQLite snapshot exceeds Uint8Array capacity');
            }
            return props.api.module.HEAPU8.slice(
              serializedPointer,
              serializedPointer + sizeLow,
            );
          } finally {
            if (serializedPointer !== 0) {
              props.api.module._sqlite3_free(serializedPointer);
            }
            if (sizePointer !== 0) props.api.module._sqlite3_free(sizePointer);
            if (schemaPointer !== 0) {
              props.api.module._sqlite3_free(schemaPointer);
            }
            if (destinationDb !== null) {
              await props.api.sqlite3.close(destinationDb);
            }
            if (retained === undefined && sourceDb !== null) {
              await props.api.sqlite3.close(sourceDb);
            }
            releaseLock?.();
          }
        },
        catch: cause =>
          ZerospinError.isZerospinError(cause)
            ? cause
            : ZerospinError.catch({
                code: 'opfs-backup-export-failed',
                message: 'Failed to export OPFS session backup',
              })(cause),
      }),
    );
  },
);
