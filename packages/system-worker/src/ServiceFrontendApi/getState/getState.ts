import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IServiceFrontendState } from '@zerospin/core/serviceSession/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  mapParseError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import {
  makeSpanLinkId,
  makeTelemetryCollector,
  makeTelemetryLayer,
  type IRpcRequest,
  type ISpanLinkRecord,
} from '@zerospin/logger';
import { Effect, Result, Schema } from 'effect';

import { getMaterializedServiceFrontendRepo } from '../../MaterializedServiceFrontendRepo/getMaterializedServiceFrontendRepo/getMaterializedServiceFrontendRepo.js';
import { getSystemLogRepo } from '../../SystemLogRepo/getSystemLogRepo/getSystemLogRepo.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';

export const getState = Effect.fn('ServiceFrontendApi.getState')(
  function* (props: {
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
        prefix: 'ServiceFrontendApi.getState received invalid arguments',
      }),
      Effect.result,
    );
    if (Result.isFailure(validatedArgs)) {
      return {
        result: yield* encodeRpc(Effect.fail(validatedArgs.failure)),
        link: null,
      };
    }

    const serviceFrontendRepo = yield* getMaterializedServiceFrontendRepo({
      key: {
        systemId: authResults.systemId,
        serviceName: authResults.serviceName,
        userId: authResults.userId,
        frontendName: authResults.frontendName,
      },
    });
    const collector = makeTelemetryCollector();
    const settled = yield* makeAsync<
      IEncodedResult<IServiceFrontendState, IAnyErrorJson>
    >(() =>
      serviceFrontendRepo.getState({
        systemId: authResults.systemId,
        frontendName: authResults.frontendName,
        serviceName: authResults.serviceName,
        userId: authResults.userId,
      }),
    ).pipe(
      Effect.flatMap(decodeRpc),
      Effect.withSpan('ServiceFrontendApi.getState', { root: true }),
      Effect.provide(makeTelemetryLayer(collector)),
      Effect.result,
    );
    const result = yield* Result.match(settled, {
      onFailure: error => encodeRpc(Effect.fail(error)),
      onSuccess: value => encodeRpc(Effect.succeed(value)),
    });

    const batch = collector.flush();
    const persisted = yield* Effect.gen(function* () {
      const systemLogRepo = yield* getSystemLogRepo({
        key: { systemId: authResults.systemId },
      });
      return yield* makeAsync<IEncodedResult<void, IAnyErrorJson>>(() =>
        systemLogRepo.appendTelemetryBatch({
          batch,
        }),
      ).pipe(Effect.flatMap(decodeRpc));
    }).pipe(Effect.result);
    const rootSpan = batch.spans.at(-1);
    const link: ISpanLinkRecord | null =
      Result.isSuccess(persisted) &&
      request.traceContext !== null &&
      rootSpan !== undefined &&
      rootSpan.parentSpanId === null &&
      rootSpan.name === 'ServiceFrontendApi.getState'
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
  },
);
