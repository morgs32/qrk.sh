import { ZerospinError, type IAnyError } from '@zerospin/error';
import { RpcStub } from 'capnweb';
import { Effect } from 'effect';

import { BackupDbApi } from '../../BackupDbApi/BackupDbApi.ts';
import { dispose } from '../../BackupDbApi/dispose/dispose.ts';
import { exportSnapshot } from '../../BackupDbApi/exportSnapshot/exportSnapshot.ts';
import type { BackupWorkerApi } from '../BackupWorkerApi.ts';

export const acquireDb = Effect.fn('BackupWorkerApi.acquireDb')(
  function* (props: {
    api: BackupWorkerApi;
    backupKey: string;
    onRevoked: RpcStub<() => void>;
  }): Effect.fn.Return<
    | { status: 'current'; db: RpcStub<BackupDbApi> }
    | {
        status: 'acquired';
        db: RpcStub<BackupDbApi>;
        snapshot: Uint8Array | null;
      },
    IAnyError
  > {
    const { api, backupKey, onRevoked } = props;
    if (
      !backupKey.startsWith('/zerospin/') ||
      new TextEncoder().encode(backupKey).byteLength >= 4096 ||
      new URL(backupKey, 'file://').pathname !== backupKey ||
      backupKey.includes('\\')
    ) {
      return yield* new ZerospinError({
        code: 'backup-key-invalid',
        message: 'Backup key must be an exact normalized /zerospin/ path',
      });
    }
    const runtime = yield* Effect.tryPromise({
      try: () => api.runtime,
      catch: ZerospinError.catch({
        code: 'backup-worker-unavailable',
        message: 'Failed to initialize IndexedDB backup storage',
      }),
    });
    if (api.disposed) {
      return yield* new ZerospinError({
        code: 'backup-worker-closed',
        message: 'Backup connection is closed',
      });
    }
    const retained = api.targets.get(backupKey);
    if (
      retained &&
      !retained.target.revoked &&
      runtime.current.get(backupKey) === retained.target
    ) {
      yield* Effect.tryPromise({
        try: () => retained.target.granted.promise,
        catch: cause =>
          new ZerospinError({
            code: 'backup-db-revoked',
            message: 'Initial acquisition did not complete',
            cause: String(cause),
          }),
      });
      if (
        retained.target.revoked ||
        runtime.current.get(backupKey) !== retained.target
      ) {
        return yield* new ZerospinError({
          code: 'backup-db-revoked',
          message: 'Backup acquisition was superseded',
        });
      }
      return { status: 'current', db: retained.stub.dup() } satisfies {
        status: 'current';
        db: RpcStub<BackupDbApi>;
      };
    }

    // Revoke at arrival, before waiting for SQLite. In-flight work completes; queued old work fails.
    const previous = runtime.current.get(backupKey);
    if (previous) {
      previous.revoked = true;
      void previous.onRevoked().catch(() => undefined);
      previous.onRevoked[Symbol.dispose]();
      const old = previous.owner.targets.get(backupKey);
      if (old?.target === previous) {
        previous.owner.targets.delete(backupKey);
        old.stub[Symbol.dispose]();
      }
    }
    const target = new BackupDbApi(backupKey, api, runtime, onRevoked.dup());
    const stub = new RpcStub(target);
    api.targets.set(backupKey, { target, stub });
    runtime.current.set(backupKey, target);
    return yield* Effect.gen(function* () {
      const snapshot = yield* exportSnapshot({ api: target });
      if (
        target.revoked ||
        api.disposed ||
        runtime.current.get(backupKey) !== target
      ) {
        return yield* new ZerospinError({
          code: 'backup-db-revoked',
          message: 'Backup acquisition was superseded',
        });
      }
      target.granted.resolve();
      return { status: 'acquired', db: stub.dup(), snapshot } satisfies {
        status: 'acquired';
        db: RpcStub<BackupDbApi>;
        snapshot: Uint8Array | null;
      };
    }).pipe(
      Effect.onError(() =>
        Effect.gen(function* () {
          target.granted.reject(new Error('Backup acquisition failed'));
          yield* dispose({ api: target }).pipe(Effect.ignore);
        }),
      ),
    );
  },
);
