import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IActorId } from '@zerospin/core/models/types';
import type { makeServiceFrontendControllerSpec } from '@zerospin/core/serviceFrontendController/makeServiceFrontendControllerSpec';
import type { IServiceFrontendState } from '@zerospin/core/serviceSession/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  mapParseError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import {
  makeSpanLinkId,
  makeTelemetryCollector,
  makeTelemetryLayer,
  type ILinkedRpcEnvelope,
  type IRpcRequest,
  type ISpanLinkRecord,
} from '@zerospin/logger';
import { RpcTarget } from 'capnweb';
import { Context, Effect, Either, Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import type { SystemWorker } from 'system-worker';

import type { IDispatchRuntime } from '../makeDispatchRuntime';
import { SystemWorkerResolver } from '../SystemWorkerResolver/SystemWorkerResolver';

class ServiceFrontendAuthResults extends Context.Tag(
  'ServiceFrontendAuthResults',
)<
  ServiceFrontendAuthResults,
  {
    readonly actorId: IActorId;
    readonly actorName: string;
    readonly deployId: string;
    readonly frontendName: string;
    readonly frontendVersion: string;
    readonly generationId: string;
    readonly serviceName: string;
    readonly systemId: ISystemId;
    readonly systemVersion: string;
    readonly systemWorkerName: string;
  }
>() {}

class ServiceFrontendSystemWorkerApi extends Context.Tag(
  'ServiceFrontendSystemWorkerApi',
)<ServiceFrontendSystemWorkerApi, SystemWorker>() {}

function makeServiceFrontendApiHandler<
  ARGS extends Array<unknown>,
  A,
  R,
>(props: {
  name: string;
  argsSchema: Schema.Schema<ARGS>;
  handler: (
    ...args: ARGS
  ) => Effect.Effect<
    A,
    IAnyError,
    R | ServiceFrontendAuthResults | ServiceFrontendSystemWorkerApi
  >;
}) {
  const { argsSchema, handler, name } = props;

  return (request: IRpcRequest<ARGS>) =>
    Effect.gen(function* () {
      const validatedArgs = yield* Schema.validate(argsSchema)(request.args, {
        onExcessProperty: 'error',
      }).pipe(
        mapParseError({
          code: 'service-frontend-api-arguments-invalid',
          prefix: `${name} received invalid arguments`,
        }),
        Effect.either,
      );

      if (Either.isLeft(validatedArgs)) {
        return {
          result: yield* encodeRpc(Effect.fail(validatedArgs.left)),
          link: null,
        };
      }

      const authResults = yield* ServiceFrontendAuthResults;
      const resolver = yield* SystemWorkerResolver;
      using systemWorker = resolver.get({
        systemWorkerName: authResults.systemWorkerName,
      });
      const collector = makeTelemetryCollector();
      const settled = yield* handler(...validatedArgs.right).pipe(
        Effect.provideService(ServiceFrontendSystemWorkerApi, systemWorker),
        Effect.provide(makeTelemetryLayer(collector)),
        Effect.either,
      );
      const result = yield* Either.match(settled, {
        onLeft: error => encodeRpc(Effect.fail(error)),
        onRight: value => encodeRpc(Effect.succeed(value)),
      });

      const batch = collector.flush();
      const persisted = yield* makeAsync(() =>
        systemWorker.appendTelemetryBatch({
          batch,
          deployId: authResults.deployId,
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

      return { result, link };
    });
}

const getFrontendState = Effect.fn('ServiceFrontendApi.getFrontendState', {
  root: true,
})(function* () {
  const authResults = yield* ServiceFrontendAuthResults;
  const systemWorker = yield* ServiceFrontendSystemWorkerApi;

  return yield* makeAsync(() =>
    systemWorker.getServiceFrontendState({
      actorId: authResults.actorId,
      actorName: authResults.actorName,
      deployId: authResults.deployId,
      frontendName: authResults.frontendName,
      generationId: authResults.generationId,
      serviceName: authResults.serviceName,
      systemWorkerName: authResults.systemWorkerName,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
});

const getFrontendStateApiHandler = makeServiceFrontendApiHandler({
  name: 'ServiceFrontendApi.getFrontendState',
  argsSchema: Schema.mutable(Schema.Tuple()),
  handler: getFrontendState,
});

const createFrontendWebSocketTicket = Effect.fn(
  'ServiceFrontendApi.createFrontendWebSocketTicket',
  { root: true },
)(function* () {
  const authResults = yield* ServiceFrontendAuthResults;
  const systemWorker = yield* ServiceFrontendSystemWorkerApi;

  return yield* makeAsync(() =>
    systemWorker.createServiceFrontendWebSocketTicket({
      actorId: authResults.actorId,
      actorName: authResults.actorName,
      deployId: authResults.deployId,
      frontendName: authResults.frontendName,
      generationId: authResults.generationId,
      serviceName: authResults.serviceName,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
});

const createFrontendWebSocketTicketApiHandler = makeServiceFrontendApiHandler({
  name: 'ServiceFrontendApi.createFrontendWebSocketTicket',
  argsSchema: Schema.mutable(Schema.Tuple()),
  handler: createFrontendWebSocketTicket,
});

export class ServiceFrontendApi extends RpcTarget {
  declare [BrandTypeId]: 'TargetApi';

  readonly #authResults: {
    readonly actorId: IActorId;
    readonly actorName: string;
    readonly deployId: string;
    readonly frontendName: string;
    readonly frontendVersion: string;
    readonly generationId: string;
    readonly serviceName: string;
    readonly systemId: ISystemId;
    readonly systemVersion: string;
    readonly systemWorkerName: string;
  };
  readonly #runtime: IDispatchRuntime;

  constructor(props: {
    authResults: {
      readonly actorId: IActorId;
      readonly actorName: string;
      readonly deployId: string;
      readonly frontendName: string;
      readonly frontendVersion: string;
      readonly generationId: string;
      readonly serviceName: string;
      readonly systemId: ISystemId;
      readonly systemVersion: string;
      readonly systemWorkerName: string;
    };
    runtime: IDispatchRuntime;
  }) {
    super();
    this.#authResults = props.authResults;
    this.#runtime = props.runtime;
  }

  async getFrontendState(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<IServiceFrontendState, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getFrontendStateApiHandler(request).pipe(
        Effect.provideService(ServiceFrontendAuthResults, this.#authResults),
      ),
    );
  }

  async createFrontendWebSocketTicket(request: IRpcRequest<[]>): Promise<
    ILinkedRpcEnvelope<
      {
        ticket: string;
        systemId: ISystemId;
        generationId: string;
        serviceName: string;
        actorId: IActorId;
        actorName: string;
        frontendName: string;
        frontendVersion: string;
      },
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      createFrontendWebSocketTicketApiHandler(request).pipe(
        Effect.provideService(ServiceFrontendAuthResults, this.#authResults),
      ),
    );
  }
}

export type IServiceFrontendAdmission = Readonly<{
  identity: Readonly<{
    actorId: IActorId;
    systemId: ISystemId;
    generationId: string;
    systemVersion: string;
    systemWorkerName: string;
    serviceName: string;
    actorName: string;
    frontendName: string;
    frontendVersion: string;
  }>;
  frontendSpec: ReturnType<typeof makeServiceFrontendControllerSpec>;
  frontendApi: ServiceFrontendApi;
}>;
