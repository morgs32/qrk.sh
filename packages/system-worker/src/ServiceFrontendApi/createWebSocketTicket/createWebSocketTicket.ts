import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { ISystemId } from '@zerospin/core/system/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { mapParseError } from '@zerospin/error';
import {
  makeSpanLinkId,
  makeTelemetryCollector,
  makeTelemetryLayer,
  type IRpcRequest,
  type ISpanLinkRecord,
} from '@zerospin/logger';
import { Effect, Result, Schema } from 'effect';

import { appendTelemetryBatch } from '../../appendTelemetryBatch/appendTelemetryBatch.js';
import { createServiceFrontendWebSocketTicket as createSystemWorkerTicket } from '../../createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.js';

export const createWebSocketTicket = Effect.fn(
  'ServiceFrontendApi.createWebSocketTicket',
)(function* (props: {
  request: IRpcRequest<[]>;
  authResults: {
    readonly userId: string;
    readonly frontendName: string;
    readonly serviceFrontendLock: Schema.Schema.Type<
      typeof ServiceFrontendLockSchema
    >;
    readonly serviceName: string;
    readonly systemId: ISystemId;
  };
}) {
  const { authResults, request } = props;
  const validatedArgs = yield* Schema.decodeUnknownEffect(
    Schema.toType(Schema.mutable(Schema.Tuple([]))),
  )(request.args, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'service-frontend-api-arguments-invalid',
      prefix:
        'ServiceFrontendApi.createWebSocketTicket received invalid arguments',
    }),
    Effect.result,
  );
  if (Result.isFailure(validatedArgs)) {
    return {
      result: yield* encodeRpc(Effect.fail(validatedArgs.failure)),
      link: null,
    };
  }

  const collector = makeTelemetryCollector();
  const settled = yield* createSystemWorkerTicket({
    frontendName: authResults.frontendName,
    serviceFrontendLock: authResults.serviceFrontendLock,
    serviceName: authResults.serviceName,
    userId: authResults.userId,
    configuredSystemId: authResults.systemId,
  }).pipe(
    Effect.withSpan('ServiceFrontendApi.createWebSocketTicket', {
      root: true,
    }),
    Effect.provide(makeTelemetryLayer(collector)),
    Effect.result,
  );
  const result = yield* Result.match(settled, {
    onFailure: error => encodeRpc(Effect.fail(error)),
    onSuccess: value => encodeRpc(Effect.succeed(value)),
  });

  const batch = collector.flush();
  const persisted = yield* appendTelemetryBatch({ batch }).pipe(Effect.result);
  const rootSpan = batch.spans.at(-1);
  const link: ISpanLinkRecord | null =
    Result.isSuccess(persisted) &&
    request.traceContext !== null &&
    rootSpan !== undefined &&
    rootSpan.parentSpanId === null &&
    rootSpan.name === 'ServiceFrontendApi.createWebSocketTicket'
      ? {
          linkId: makeSpanLinkId(),
          traceId: rootSpan.traceId,
          spanId: rootSpan.spanId,
          priorTraceId: request.traceContext.traceId,
          priorSpanId: request.traceContext.parentSpanId,
          kind: 'causedBy',
        }
      : null;
  return { result, link };
});
