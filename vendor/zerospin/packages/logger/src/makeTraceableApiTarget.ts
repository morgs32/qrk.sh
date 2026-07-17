import { Effect, Either, Schema } from 'effect';

import { TelemetryCollector } from './TelemetryCollector.ts';
import type {
  ILinkedRpcEnvelope,
  IRpcRequest,
} from './types.ts';

export function makeTraceableApiTarget<TARGET extends object>(
  apiTarget: TARGET,
): {
  [K in keyof TARGET]: TARGET[K] extends (
    request: IRpcRequest<infer ARGS>,
  ) => infer RESULT
    ? Awaited<RESULT> extends ILinkedRpcEnvelope<infer A, infer E>
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
              const traceId = Schema.decodeUnknownEither(
                Schema.TemplateLiteral('trc_', Schema.String),
              )(span.traceId);
              const parentSpanId = Schema.decodeUnknownEither(
                Schema.TemplateLiteral('spn_', Schema.String),
              )(span.spanId);

              if (Either.isLeft(traceId) || Either.isLeft(parentSpanId)) {
                return null;
              }

              return {
                traceId: traceId.right,
                parentSpanId: parentSpanId.right,
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
          }).pipe(Effect.either);

          if (Either.isLeft(settled)) {
            return yield* Effect.fail(settled.left);
          }

          const envelope = Schema.decodeUnknownEither(
            Schema.Struct({
              result: Schema.Union(
                Schema.Struct({
                  _tag: Schema.Literal('Right'),
                  right: Schema.Unknown,
                }),
                Schema.Struct({
                  _tag: Schema.Literal('Left'),
                  left: Schema.Unknown,
                }),
              ),
              link: Schema.NullOr(
                Schema.Struct({
                  linkId: Schema.TemplateLiteral('lnk_', Schema.String),
                  traceId: Schema.TemplateLiteral('trc_', Schema.String),
                  spanId: Schema.TemplateLiteral('spn_', Schema.String),
                  priorTraceId: Schema.TemplateLiteral(
                    'trc_',
                    Schema.String,
                  ),
                  priorSpanId: Schema.TemplateLiteral(
                    'spn_',
                    Schema.String,
                  ),
                  kind: Schema.Literal('causedBy', 'retryOf'),
                }),
              ),
            }),
          )(settled.right);

          if (Either.isLeft(envelope)) {
            return yield* Effect.fail(
              new Error('makeTraceableApiTarget expected ILinkedRpcEnvelope'),
            );
          }

          const collector = yield* TelemetryCollector;
          if (envelope.right.link !== null) {
            collector.addLinks([envelope.right.link]);
          }

          if (envelope.right.result._tag === 'Left') {
            return yield* Effect.fail(envelope.right.result.left);
          }
          return envelope.right.result.right;
        });
    },
  });
}
