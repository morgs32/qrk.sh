import {
  acquireBackupWorker,
  type IBackupWorker,
} from '@zerospin/backup-worker';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Cause, Effect, Exit, Fiber, Scope } from 'effect';

/**
 * Eager caller-owned backup connection. Construction starts SharedWorker
 * acquisition immediately. Sessions await readiness without owning the fiber
 * or scope. Dispose after all borrowing sessions.
 */
export function makeBackup(): {
  readonly ready: Effect.Effect<IBackupWorker, IAnyError>;
  dispose(): Promise<void>;
} {
  const backupScope = Effect.runSync(Scope.make());
  let disposed = false;
  let disposePromise: Promise<void> | null = null;

  // Cache the acquisition fiber, not a caller's wait: one session may cancel
  // while a sibling still awaits the shared connection.
  const acquisitionFiber = Effect.runSync(
    Effect.suspend(() => acquireBackupWorker()).pipe(
      Scope.provide(backupScope),
      Effect.forkIn(backupScope),
    ),
  );

  const ready = Fiber.join(acquisitionFiber);

  // Attach failure handling immediately so a failed eager acquisition cannot
  // become an unhandled rejection before any session awaits it.
  Effect.runFork(
    ready.pipe(
      Effect.matchCause({
        onSuccess: () => undefined,
        onFailure: cause => {
          if (!disposed) {
            // Retain the failure for awaiters; squash only for the side log path.
            void Cause.squash(cause);
          }
        },
      }),
      Effect.catch(() => Effect.void),
    ),
  );

  return {
    get ready() {
      if (disposed) {
        return Effect.fail(
          new ZerospinError({
            code: 'backup-disposed',
            message: 'Backup connection has been disposed',
          }),
        );
      }
      return ready;
    },
    dispose() {
      if (disposePromise !== null) {
        return disposePromise;
      }
      disposed = true;
      disposePromise = Effect.runPromise(
        Fiber.interrupt(acquisitionFiber).pipe(
          Effect.ensuring(Scope.close(backupScope, Exit.void)),
        ),
      );
      return disposePromise;
    },
  };
}
