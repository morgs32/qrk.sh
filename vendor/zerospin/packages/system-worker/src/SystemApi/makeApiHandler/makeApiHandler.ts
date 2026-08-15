import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { mapParseError, type IAnyError } from '@zerospin/error';
import {
  makeSpanLinkId,
  makeTelemetryCollector,
  makeTelemetryLayer,
  type IRpcRequest,
  type ISpanLinkRecord,
} from '@zerospin/logger';
import { Context, Effect, Either, Schema } from 'effect';

import type { SystemWorker } from '../../SystemWorker.js';
import { SystemWorkerResolver } from '../../SystemWorkerResolver/SystemWorkerResolver.js';

export class SystemApiAuthResults extends Context.Tag('SystemApiAuthResults')<
  SystemApiAuthResults,
  {
    readonly generationId: string;
    readonly systemId: ISystemId;
    readonly systemWorkerName: string;
  }
>() {}

export class SystemWorkerApi extends Context.Tag('SystemWorkerApi')<
  SystemWorkerApi,
  SystemWorker
>() {}

export function makeApiHandler<ARGS extends Array<unknown>, A, R>(props: {
  name: string;
  generationReadRoute?: boolean;
  argsSchema: Schema.Schema<ARGS>;
  handler: (
    ...args: ARGS
  ) => Effect.Effect<A, IAnyError, R | SystemApiAuthResults | SystemWorkerApi>;
}) {
  const { argsSchema, handler, name } = props;

  return (request: IRpcRequest<ARGS>) =>
    Effect.gen(function* () {
      const validatedArgs = yield* Schema.validate(argsSchema)(request.args, {
        onExcessProperty: 'error',
      }).pipe(
        mapParseError({
          code: 'system-api-arguments-invalid',
          prefix: `${name} received invalid arguments`,
        }),
        Effect.either,
      );

      if (Either.isLeft(validatedArgs)) {
        const result = yield* encodeRpc(Effect.fail(validatedArgs.left));
        return {
          result,
          link: null,
        };
      }

      const authResults = yield* SystemApiAuthResults;
      const resolver = yield* SystemWorkerResolver;
      using systemWorker = resolver.get({
        systemWorkerName: authResults.systemWorkerName,
      });
      const collector = makeTelemetryCollector();

      const settled = yield* handler(...validatedArgs.right).pipe(
        Effect.annotateSpans(
          props.generationReadRoute === false
            ? { systemId: authResults.systemId }
            : {
                generationId: authResults.generationId,
                systemId: authResults.systemId,
              },
        ),
        Effect.provideService(SystemApiAuthResults, authResults),
        Effect.provideService(SystemWorkerApi, systemWorker),
        Effect.provide(makeTelemetryLayer(collector)),
        Effect.either,
      );
      const result = yield* Either.match(settled, {
        onLeft: error => encodeRpc(Effect.fail(error)),
        onRight: value => encodeRpc(Effect.succeed(value)),
      });

      const batch = collector.flush();
      const persisted =
        props.generationReadRoute === false
          ? Either.left(null)
          : yield* makeAsync(() =>
              systemWorker.appendTelemetryBatch({
                batch,
                generationId: authResults.generationId,
              }),
            ).pipe(Effect.flatMap(decodeRpc), Effect.either);
      const rootSpan = batch.spans.at(-1);

      const link: ISpanLinkRecord | null =
        Either.isRight(persisted) &&
        request.traceContext !== null &&
        rootSpan !== undefined &&
        rootSpan.parentSpanId === null &&
        rootSpan.name === name
          ? {
              linkId: makeSpanLinkId(),
              traceId: rootSpan.traceId,
              spanId: rootSpan.spanId,
              priorTraceId: request.traceContext.traceId,
              priorSpanId: request.traceContext.parentSpanId,
              kind: 'causedBy',
            }
          : null;

      return {
        result,
        link,
      };
    });
}
