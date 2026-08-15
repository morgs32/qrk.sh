import type { Async } from '@zerospin/core/async/Async';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

export const alarm = Effect.fn('SystemRepo.alarm')(function* (props: {
  drainSystemWrites: (props: {
    alarm: true;
    throughWriteIndex: null;
    waitForTerminal: false;
  }) => Effect.Effect<void, IAnyError, Async>;
  resumeActivation: () => Effect.Effect<void, IAnyError, Async>;
}): Effect.fn.Return<void, IAnyError, Async> {
  yield* props.drainSystemWrites({
    alarm: true,
    throughWriteIndex: null,
    waitForTerminal: false,
  });
  yield* props.resumeActivation();
});
