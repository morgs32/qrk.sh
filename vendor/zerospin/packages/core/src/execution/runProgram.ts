import { makeZerospinError } from '@zerospin/error';
import { Cause, Effect, Exit } from 'effect';

/** Stop suspended work before returning a local failure or applying any mutations. */
export const runProgram = Effect.fn('runProgram')(function* <A, E, R>(
  program: Effect.Effect<A, E, R>,
) {
  const context = yield* Effect.context<R>();
  const exit = Effect.runSyncExitWith(context)(program);
  if (Exit.isSuccess(exit)) return exit.value;
  for (const reason of exit.cause.reasons) {
    if (Cause.isDieReason(reason) && Cause.isAsyncFiberError(reason.defect)) {
      reason.defect.fiber.interruptUnsafe();
      return yield* Effect.fail(
        makeZerospinError({
          code: 'program-must-be-synchronous',
          message:
            'Programs and their capabilities must complete synchronously',
        }),
      );
    }
  }
  return yield* Effect.failCause(exit.cause);
});
