import { Effect, Either } from 'effect';

import { makeSpanId } from './makeTelemetryIds.ts';
import { TelemetryCollector } from './TelemetryCollector.ts';
import type {
  IRpcEnvelope,
  IRpcRequest,
  ISpanId,
  ITraceContext,
  ITraceId,
} from './types.ts';

const liveTraceContext: Effect.Effect<ITraceContext | null> =
  Effect.currentSpan.pipe(
    Effect.map(span => ({
      traceId: span.traceId as ITraceId,
      parentSpanId: span.spanId as ISpanId,
    })),
    Effect.orElseSucceed(() => null),
  );

const isRpcEnvelope = (
  value: unknown,
): value is IRpcEnvelope<unknown, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  'result' in value &&
  'telemetry' in value;

const unwrapEnvelope = <A, E>(
  envelope: IRpcEnvelope<A, E>,
): Effect.Effect<A, E, TelemetryCollector> =>
  Effect.gen(function* () {
    const collector = yield* TelemetryCollector;
    collector.merge(envelope.telemetry);
    if (envelope.result._tag === 'Left') {
      return yield* Effect.fail(envelope.result.left);
    }
    return envelope.result.right;
  });

export const makeTraceableRpcTarget = <TARGET extends object>(
  mockRpcTarget: TARGET,
): {
  [K in keyof TARGET]: TARGET[K] extends (
    request: IRpcRequest<infer ARGS>,
  ) => infer RESULT
    ? Awaited<RESULT> extends IRpcEnvelope<infer A, infer E>
      ? (...args: ARGS) => Effect.Effect<A, E | Error, TelemetryCollector>
      : TARGET[K] extends (
            ...args: infer FALLBACK_ARGS
          ) => PromiseLike<infer _R>
        ? (
            ...args: FALLBACK_ARGS
          ) => Effect.Effect<never, Error, TelemetryCollector>
        : TARGET[K]
    : TARGET[K] extends (...args: infer ARGS) => PromiseLike<infer _R>
      ? (...args: ARGS) => Effect.Effect<never, Error, TelemetryCollector>
      : TARGET[K];
} =>
  new Proxy(mockRpcTarget, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol' || prop === 'then') {
        return Reflect.get(target, prop, receiver);
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') {
        return value;
      }

      const method = value;
      const methodName = String(prop);

      return (...args: unknown[]) =>
        Effect.gen(function* () {
          const traceContext = yield* liveTraceContext;
          const startedAt = Date.now();

          const settled = yield* Effect.tryPromise({
            try: () =>
              Reflect.apply(method, target, [
                {
                  traceContext,
                  args,
                },
              ]),
            catch: error =>
              error instanceof Error ? error : new Error(String(error)),
          }).pipe(Effect.either);

          if (Either.isLeft(settled)) {
            const collector = yield* TelemetryCollector;
            if (traceContext !== null) {
              collector.addSpan({
                spanId: makeSpanId(),
                traceId: traceContext.traceId,
                parentSpanId: traceContext.parentSpanId,
                name: methodName,
                status: 'lost',
                startedAt,
                endedAt: Date.now(),
                attributes: { transportError: String(settled.left) },
              });
            }
            return yield* Effect.fail(settled.left);
          }

          if (!isRpcEnvelope(settled.right)) {
            return yield* Effect.fail(
              new Error('makeTraceableRpcTarget expected IRpcEnvelope'),
            );
          }

          return yield* unwrapEnvelope(settled.right);
        });
    },
  }) as {
    [K in keyof TARGET]: TARGET[K] extends (
      request: IRpcRequest<infer ARGS>,
    ) => infer RESULT
      ? Awaited<RESULT> extends IRpcEnvelope<infer A, infer E>
        ? (...args: ARGS) => Effect.Effect<A, E | Error, TelemetryCollector>
        : TARGET[K] extends (
              ...args: infer FALLBACK_ARGS
            ) => PromiseLike<infer _R>
          ? (
              ...args: FALLBACK_ARGS
            ) => Effect.Effect<never, Error, TelemetryCollector>
          : TARGET[K]
      : TARGET[K] extends (...args: infer ARGS) => PromiseLike<infer _R>
        ? (...args: ARGS) => Effect.Effect<never, Error, TelemetryCollector>
        : TARGET[K];
  };
