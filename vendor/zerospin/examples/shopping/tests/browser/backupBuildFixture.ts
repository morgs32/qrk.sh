import { acquireBackupWorker, type IBackupDb } from '@zerospin/backup-worker';
import { Effect, Exit, Result, Scope } from 'effect';

declare const __BACKUP_BUILD__: string;

const scope = Scope.makeUnsafe();
const worker = await Effect.runPromise(
  acquireBackupWorker().pipe(Scope.provide(scope)),
);
let db: IBackupDb | undefined;
let revoked = false;
let disconnected = false;
worker.onDisconnect(() => {
  disconnected = true;
});

// Test-only browser boundary, independently bundled twice by the preview suite.
Reflect.set(globalThis, 'backupAcceptance', {
  build: __BACKUP_BUILD__,
  get revoked() {
    return revoked;
  },
  get disconnected() {
    return disconnected;
  },
  async acquire(backupKey: string) {
    revoked = false;
    const grant = await Effect.runPromise(
      worker.acquireDb({
        backupKey,
        onRevoked: () => {
          revoked = true;
        },
      }),
    );
    db = grant.db;
    return {
      status: grant.status,
      snapshot:
        grant.status === 'acquired' && grant.snapshot !== null
          ? Array.from(grant.snapshot)
          : null,
    };
  },
  async apply(
    statements: readonly {
      sql: string;
      parameters: readonly (string | number | null)[];
    }[],
  ) {
    if (db === undefined) throw new Error('Acquire the test database first');
    const result = await Effect.runPromise(
      db.applyStatements({ statements }).pipe(Effect.result),
    );
    return Result.isFailure(result)
      ? {
          _tag: 'Failure',
          failure: {
            code: result.failure.code,
            message: result.failure.message,
          },
        }
      : { _tag: 'Success' };
  },
  async overwrite(snapshot: number[]) {
    if (db === undefined) throw new Error('Acquire the test database first');
    const result = await Effect.runPromise(
      db
        .overwriteDb({ snapshot: new Uint8Array(snapshot) })
        .pipe(Effect.result),
    );
    return Result.isFailure(result)
      ? {
          _tag: 'Failure',
          failure: {
            code: result.failure.code,
            message: result.failure.message,
          },
        }
      : { _tag: 'Success' };
  },
  async snapshot() {
    if (db === undefined) throw new Error('Acquire the test database first');
    const snapshot = await Effect.runPromise(db.exportSnapshot());
    return snapshot === null ? null : Array.from(snapshot);
  },
  async disposeDb() {
    if (db === undefined) throw new Error('Acquire the test database first');
    const result = await Effect.runPromise(db.dispose().pipe(Effect.result));
    return Result.isFailure(result)
      ? {
          _tag: 'Failure',
          failure: {
            code: result.failure.code,
            message: result.failure.message,
          },
        }
      : { _tag: 'Success' };
  },
  async close() {
    await Effect.runPromise(Scope.close(scope, Exit.void));
  },
});
