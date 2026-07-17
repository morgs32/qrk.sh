/*
 * System-worker annotation:
 * Re-enters the AccountBlockRepo queue from the Durable Object alarm.
 */

import type { IAnyError } from '@zerospin/error';
import { Effect, Tracer } from 'effect';

export const alarm = Effect.fn('AccountBlockRepo.alarm')(function* (props: {
  storage: DurableObjectStorage;
  start: () => Effect.Effect<unknown, IAnyError>;
}) {
  const retryOf = yield* Effect.promise(() =>
    props.storage.get<{
      traceId: string;
      spanId: string;
    }>('telemetryAlarmRetryOf'),
  ).pipe(Effect.catchAllCause(() => Effect.succeed(undefined)));
  if (retryOf !== undefined) {
    yield* Effect.promise(() =>
      props.storage.delete('telemetryAlarmRetryOf'),
    ).pipe(Effect.catchAllCause(() => Effect.void));
    const span = yield* Effect.currentSpan.pipe(Effect.orDie);
    span.addLinks([
      {
        _tag: 'SpanLink',
        span: Tracer.externalSpan({
          traceId: retryOf.traceId,
          spanId: retryOf.spanId,
        }),
        attributes: { kind: 'retryOf' },
      },
    ]);
  }
  return yield* props.start();
});
