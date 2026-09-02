import { Effect, Option, Result, Schema } from 'effect';

import { TelemetryCollector } from './TelemetryCollector.ts';
import type { ILinkedRpcEnvelope, IRpcRequest } from './types.ts';

export function makeTraceableApiTarget<TARGET extends object>(
  apiTarget: TARGET,
): {
  [K in keyof TARGET]: TARGET[K] extends (
    request: IRpcRequest<infer ARGS>,
  ) => infer RESULT
    ? Awaited<RESULT> extends ILinkedRpcEnvelope<infer A, infer E>
      ? (...args: ARGS) => Effect.Effect<A, E | Error>
      : TARGET[K] extends (
            ...args: infer FALLBACK_ARGS
          ) => PromiseLike<infer _R>
        ? (...args: FALLBACK_ARGS) => Effect.Effect<never, Error>
        : TARGET[K]
    : TARGET[K] extends (...args: infer ARGS) => PromiseLike<infer _R>
      ? (...args: ARGS) => Effect.Effect<never, Error>
      : TARGET[K];
};
export function makeTraceableApiTarget(apiTarget: object) {
  return new Proxy(apiTarget, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol' || prop === 'then') {
        return Reflect.get(target, prop, receiver);
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') {
        return value;
      }

      return (...args: unknown[]) =>
        Effect.gen(function* () {
          const traceContext = yield* Effect.currentSpan.pipe(
            Effect.map(span => {
              const traceId = Schema.decodeUnknownResult(
                Schema.TemplateLiteral(['trc_', Schema.String]),
              )(span.traceId);
              const parentSpanId = Schema.decodeUnknownResult(
                Schema.TemplateLiteral(['spn_', Schema.String]),
              )(span.spanId);

              if (Result.isFailure(traceId) || Result.isFailure(parentSpanId)) {
                return null;
              }

              return {
                traceId: traceId.success,
                parentSpanId: parentSpanId.success,
              };
            }),
            Effect.orElseSucceed(() => null),
          );

          const settled = yield* Effect.tryPromise({
            try: () =>
              Promise.resolve(
                Reflect.apply(value, target, [
                  {
                    traceContext,
                    args,
                  },
                ]),
              ),
            catch: error =>
              error instanceof Error ? error : new Error(String(error)),
          }).pipe(Effect.result);

          if (Result.isFailure(settled)) {
            return yield* Effect.fail(settled.failure);
          }

          const envelope = Schema.decodeUnknownResult(
            Schema.Struct({
              result: Schema.Union([
                Schema.Struct({
                  _tag: Schema.Literal('Success'),
                  success: Schema.Unknown,
                }),
                Schema.Struct({
                  _tag: Schema.Literal('Failure'),
                  failure: Schema.Unknown,
                }),
              ]),
              link: Schema.NullOr(
                Schema.Struct({
                  linkId: Schema.TemplateLiteral(['lnk_', Schema.String]),
                  traceId: Schema.TemplateLiteral(['trc_', Schema.String]),
                  spanId: Schema.TemplateLiteral(['spn_', Schema.String]),
                  priorTraceId: Schema.TemplateLiteral(['trc_', Schema.String]),
                  priorSpanId: Schema.TemplateLiteral(['spn_', Schema.String]),
                  kind: Schema.Literals(['causedBy', 'retryOf']),
                }),
              ),
            }),
          )(settled.success);

          if (Result.isFailure(envelope)) {
            return yield* Effect.fail(
              new Error('makeTraceableApiTarget expected ILinkedRpcEnvelope'),
            );
          }

          const collector = yield* Effect.serviceOption(TelemetryCollector);
          if (envelope.success.link !== null && Option.isSome(collector)) {
            collector.value.addLinks([envelope.success.link]);
          }

          if (envelope.success.result._tag === 'Failure') {
            return yield* Effect.fail(envelope.success.result.failure);
          }
          return envelope.success.result.success;
        });
    },
  });
}
