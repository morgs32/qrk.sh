import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Cause, Effect, Exit } from 'effect';

export const runGuard = Effect.fn('runGuard')(function* <
  PROPS,
  ERROR extends IAnyError,
  REQUIREMENTS,
>(
  props: Readonly<{
    guard: (props: PROPS) => Effect.Effect<void, ERROR, REQUIREMENTS>;
    props: PROPS;
  }>,
): Effect.fn.Return<
  void,
  ERROR | ZerospinError<'guard-must-be-synchronous'>,
  REQUIREMENTS
> {
  const { guard, props: guardProps } = props;
  const context = yield* Effect.context<REQUIREMENTS>();
  const exit = Effect.runSyncExitWith(context)(guard(guardProps));
  if (Exit.isSuccess(exit)) {
    return;
  }

  for (const reason of exit.cause.reasons) {
    if (Cause.isDieReason(reason) && Cause.isAsyncFiberError(reason.defect)) {
      reason.defect.fiber.interruptUnsafe();
      return yield* new ZerospinError({
        code: 'guard-must-be-synchronous',
        message: 'Guards must complete synchronously',
      });
    }
  }

  return yield* Effect.failCause(exit.cause);
});
