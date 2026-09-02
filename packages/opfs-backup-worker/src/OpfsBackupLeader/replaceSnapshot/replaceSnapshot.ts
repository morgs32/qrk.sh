import type { ISessionId } from '@zerospin/core/session/types';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';
import * as SQLite from 'wa-sqlite';

import type { OpfsBackupLeaderApi } from '../OpfsBackupLeaderApi.ts';
import { copySqliteDatabase } from '../copySqliteDatabase/copySqliteDatabase.ts';

export const replaceSnapshot = Effect.fn('OpfsBackupLeaderApi.replaceSnapshot')(
  function* (props: {
    api: OpfsBackupLeaderApi;
    backupClientId: number;
    backupKey: string;
    sessionId: ISessionId;
    snapshot: Uint8Array;
  }) {
    if (!/^[a-f0-9]{64}$/.test(props.backupKey)) {
      return yield* new ZerospinError({
        code: 'opfs-backup-replace-failed',
        message: 'Invalid OPFS backup key',
      });
    }

    const key = JSON.stringify([props.backupKey, props.sessionId]);
    let releaseAcquiredLock: (() => void) | null = null;
    if (!props.api.handles.has(key)) {
      releaseAcquiredLock = yield* Effect.tryPromise({
        try: async () => {
          const acquired = Promise.withResolvers<void>();
          const lifetime = Promise.withResolvers<void>();
          void navigator.locks
            .request(
              `zerospin:opfs:${props.backupKey}:${props.sessionId}`,
              { mode: 'exclusive' },
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
          code: 'opfs-backup-replace-failed',
          message: 'Failed to acquire OPFS backup claim',
        }),
      });
    }

    const acquiredRelease = releaseAcquiredLock;
    return yield* props.api.semaphore.withPermits(1)(
      Effect.tryPromise({
        try: async () => {
          const existing = props.api.handles.get(key);
          if (existing !== undefined && acquiredRelease !== null) {
            acquiredRelease();
          }

          const retainedRelease =
            existing?.releaseLock ?? acquiredRelease ?? undefined;
          if (retainedRelease === undefined) {
            throw new Error('OPFS backup claim was not retained');
          }

          let destinationDb = existing?.db ?? null;
          let sourceDb: number | null = null;
          let retainedDestination = existing !== undefined;
          try {
            sourceDb = await props.api.sqlite3.open_v2(':memory:');
            const dataPointer = props.api.module._sqlite3_malloc(
              props.snapshot.byteLength,
            );
            props.api.module.HEAPU8.set(props.snapshot, dataPointer);
            const schemaPointer = props.api.module._sqlite3_malloc(5);
            props.api.module.HEAPU8.set(
              new Uint8Array([109, 97, 105, 110, 0]),
              schemaPointer,
            );
            const deserializeResult = props.api.module._sqlite3_deserialize(
              sourceDb,
              schemaPointer,
              dataPointer,
              props.snapshot.byteLength,
              0,
              props.snapshot.byteLength,
              0,
              3,
            );
            props.api.module._sqlite3_free(schemaPointer);
            if (deserializeResult !== SQLite.SQLITE_OK) {
              props.api.module._sqlite3_free(dataPointer);
              throw new Error(
                `sqlite3_deserialize failed with code ${deserializeResult}`,
              );
            }

            if (destinationDb === null) {
              destinationDb = await props.api.sqlite3.open_v2(
                `/zerospin/${props.backupKey}/${props.sessionId}.sqlite3`,
                SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE,
                'opfs-coop-sync',
              );
            }

            await Effect.runPromise(
              copySqliteDatabase({
                destinationDb,
                module: props.api.module,
                sourceDb,
              }),
            );
            props.api.handles.set(key, {
              backupClientId: props.backupClientId,
              db: destinationDb,
              releaseLock: retainedRelease,
            });
            retainedDestination = true;
            destinationDb = null;
          } finally {
            if (sourceDb !== null) await props.api.sqlite3.close(sourceDb);
            if (destinationDb !== null && !retainedDestination) {
              try {
                await props.api.sqlite3.close(destinationDb);
              } finally {
                retainedRelease();
              }
            } else if (!retainedDestination) {
              retainedRelease();
            }
          }
        },
        catch: cause =>
          ZerospinError.isZerospinError(cause)
            ? cause
            : ZerospinError.catch({
                code: 'opfs-backup-replace-failed',
                message: 'Failed to replace OPFS session backup',
              })(cause),
      }),
    );
  },
);
