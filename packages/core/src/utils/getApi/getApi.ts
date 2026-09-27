import {
  catchZerospinError,
  encodeError,
  isZerospinError,
  ZerospinErrorJsonSchema,
  type IZerospinErrorJson,
} from '@zerospin/error';
import {
  TelemetryCollector,
  type ILinkedRpcEnvelope,
  type IRpcRequest,
} from '@zerospin/logger';
import { type RpcTarget } from 'capnweb';
import { Effect, Option, Result, Schema } from 'effect';

import { newSyncRpcSession } from './newSyncRpcSession/newSyncRpcSession.ts';

export type IApiFailure = IZerospinErrorJson<
  'async-failed' | 'rpc-invalid-response' | 'rpc-selection-failed'
>;

export type IApi<T> = {
  [K in keyof T as T[K] extends (
    request: IRpcRequest<infer _ARGS>,
  ) => infer RESULT
    ? Awaited<RESULT> extends ILinkedRpcEnvelope<unknown, unknown>
      ? K
      : never
    : never]: T[K] extends (request: IRpcRequest<infer ARGS>) => infer RESULT
    ? Awaited<RESULT> extends ILinkedRpcEnvelope<infer A, infer E>
      ? (...args: ARGS) => Effect.Effect<A, E | IApiFailure>
      : never
    : never;
};

/**
 * Return a reusable Effect-facing API without opening a session.
 * Each execution opens one HTTP batch and synchronously selects a capability.
 * Selectors must only select capabilities; prepare the admission request before calling getApi.
 * Concurrent calls use separate batches. No retries or shared session state.
 */
export function getApi<ROOT extends RpcTarget>(
  apiUrl: string,
): <TARGET extends object>(
  select: (root: ReturnType<typeof newSyncRpcSession<ROOT>>) => TARGET,
) => Effect.Effect<IApi<TARGET>>;
export function getApi(apiUrl: string) {
  let endpoint = '[invalid endpoint]';
  try {
    const url = new URL(apiUrl);
    endpoint = url.origin + (url.pathname === '/' ? '' : url.pathname);
  } catch {
    // Do not echo credentials from an unparseable endpoint.
  }
  return (
    select: (root: ReturnType<typeof newSyncRpcSession<RpcTarget>>) => object,
  ) =>
    Effect.sync(
      () =>
        new Proxy(
          {},
          {
            get(_target, method) {
              // An API is neither a Promise nor a remotely disposable capability.
              if (typeof method !== 'string' || method === 'then') {
                return undefined;
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

                      if (
                        Result.isFailure(traceId) ||
                        Result.isFailure(parentSpanId)
                      ) {
                        return null;
                      }

                      return {
                        traceId: traceId.success,
                        parentSpanId: parentSpanId.success,
                      };
                    }),
                    Effect.orElseSucceed(() => null),
                  );

                  const extra = { endpoint, method, ...(traceContext ?? {}) };
                  const selectionFailure = catchZerospinError({
                    code: 'rpc-selection-failed',
                    message: `Could not select the RPC API for ${method} at ${endpoint}.`,
                    preferCauseMessage: false,
                    extra: { ...extra, phase: 'selection' },
                  });
                  const session = yield* Effect.acquireRelease(
                    Effect.try({
                      try: () => newSyncRpcSession<RpcTarget>(apiUrl),
                      catch: selectionFailure,
                    }),
                    session => Effect.sync(() => session[Symbol.dispose]()),
                  );
                  const target = yield* Effect.try({
                    try: () => select(session),
                    catch: selectionFailure,
                  });
                  const settled = yield* Effect.tryPromise({
                    try: () =>
                      Promise.resolve(
                        Reflect.apply(Reflect.get(target, method), target, [
                          { traceContext, args },
                        ]),
                      ),
                    catch: catchZerospinError({
                      code: 'async-failed',
                      message: `RPC ${method} at ${endpoint} failed before a usable result was available.`,
                      preferCauseMessage: false,
                      extra: {
                        ...extra,
                        phase: 'invocation',
                        remoteOutcome: 'unknown',
                      },
                    }),
                  });
                  const envelope = Schema.decodeUnknownResult(
                    Schema.Struct({
                      result: Schema.Union([
                        Schema.Struct({
                          _tag: Schema.Literal('Success'),
                          success: Schema.Unknown,
                        }),
                        Schema.Struct({
                          _tag: Schema.Literal('Failure'),
                          failure: Schema.Struct({
                            ...ZerospinErrorJsonSchema.fields,
                            scope: Schema.optionalKey(
                              Schema.Literals([
                                'contract',
                                'actor',
                                'aggregate',
                              ]),
                            ),
                          }),
                        }),
                      ]),
                      link: Schema.NullOr(
                        Schema.Struct({
                          linkId: Schema.TemplateLiteral([
                            'lnk_',
                            Schema.String,
                          ]),
                          traceId: Schema.TemplateLiteral([
                            'trc_',
                            Schema.String,
                          ]),
                          spanId: Schema.TemplateLiteral([
                            'spn_',
                            Schema.String,
                          ]),
                          priorTraceId: Schema.TemplateLiteral([
                            'trc_',
                            Schema.String,
                          ]),
                          priorSpanId: Schema.TemplateLiteral([
                            'spn_',
                            Schema.String,
                          ]),
                          kind: Schema.Literals(['causedBy', 'retryOf']),
                        }),
                      ),
                    }),
                  )(settled);

                  if (Result.isFailure(envelope)) {
                    return yield* Effect.fail(
                      catchZerospinError({
                        code: 'rpc-invalid-response',
                        message: `RPC ${method} at ${endpoint} returned an invalid result envelope.`,
                        preferCauseMessage: false,
                        extra: { ...extra, phase: 'response' },
                      })(envelope.failure),
                    );
                  }
                  const collector =
                    yield* Effect.serviceOption(TelemetryCollector);
                  if (
                    envelope.success.link !== null &&
                    Option.isSome(collector)
                  ) {
                    collector.value.addLinks([envelope.success.link]);
                  }
                  if (envelope.success.result._tag === 'Failure') {
                    return yield* Effect.fail(envelope.success.result.failure);
                  }
                  return envelope.success.result.success;
                }).pipe(
                  Effect.catch(failure =>
                    isZerospinError(failure)
                      ? encodeError(failure).pipe(Effect.flatMap(Effect.fail))
                      : Effect.fail(failure),
                  ),
                  Effect.scoped,
                );
            },
          },
        ),
    );
}
