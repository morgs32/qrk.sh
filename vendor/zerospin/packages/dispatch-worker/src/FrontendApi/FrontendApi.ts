import type { IActor } from '@zerospin/core/actorController/types';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { StagedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IEncodedCommand,
  IFailedStagedCommand,
  IPushedCommand,
  IStagedCommand,
} from '@zerospin/core/contracts/types';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import type { IFrontendState } from '@zerospin/core/session/types';
import type {
  ISystemEnvironmentId,
  ISystemId,
} from '@zerospin/core/system/types';
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

class FrontendAuthResults extends Context.Tag('FrontendAuthResults')<
  FrontendAuthResults,
  {
    readonly actor: IActor;
    readonly accountName: string;
    readonly actorName: string;
    readonly deployId: string;
    readonly frontendName: string;
    readonly generationId: string;
    readonly systemId: ISystemId;
    readonly systemWorkerName: string;
    readonly systemEnvironmentId: ISystemEnvironmentId;
  }
>() {}

class SystemWorkerApi extends Context.Tag('SystemWorkerApi')<
  SystemWorkerApi,
  SystemWorker
>() {}

function makeApiHandler<ARGS extends Array<unknown>, A, R>(props: {
  name: string;
  argsSchema: Schema.Schema<ARGS>;
  handler: (
    ...args: ARGS
  ) => Effect.Effect<
    A,
    IAnyError,
    R | FrontendAuthResults | SystemWorkerApi
  >;
}) {
  const { argsSchema, handler, name } = props;

  return (request: IRpcRequest<ARGS>) =>
    Effect.gen(function* () {
      const validatedArgs = yield* Schema.validate(argsSchema)(request.args, {
        onExcessProperty: 'error',
      }).pipe(
        mapParseError({
          code: 'frontend-api-arguments-invalid',
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

      const authResults = yield* FrontendAuthResults;
      const resolver = yield* SystemWorkerResolver;
      using systemWorker = resolver.get({
        systemWorkerName: authResults.systemWorkerName,
      });
      const collector = makeTelemetryCollector();

      const settled = yield* handler(...validatedArgs.right).pipe(
        Effect.provideService(SystemWorkerApi, systemWorker),
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

      return {
        result,
        link,
      };
    });
}

const fetchActor = Effect.fn('FrontendApi.fetchActor', { root: true })(
  function* () {
    const authResults = yield* FrontendAuthResults;
    const systemWorker = yield* SystemWorkerApi;
    const systemSpec = yield* makeAsync(() =>
      systemWorker.getSystemSpec({
        deployId: authResults.deployId,
        generationId: authResults.generationId,
      }),
    ).pipe(Effect.flatMap(decodeRpc));

    return {
      actor: authResults.actor,
      deployId: authResults.deployId,
      generationId: authResults.generationId,
      systemId: authResults.systemId,
      systemVersion: systemSpec.version,
      systemWorkerName: authResults.systemWorkerName,
      systemEnvironmentId: authResults.systemEnvironmentId,
    };
  },
);

const fetchActorApiHandler = makeApiHandler({
  name: 'FrontendApi.fetchActor',
  argsSchema: Schema.mutable(Schema.Tuple()),
  handler: fetchActor,
});

const pushCommands = Effect.fn('FrontendApi.pushCommands', { root: true })(
  function* (props: {
    readonly commands: readonly IEncodedCommand<IStagedCommand>[];
  }) {
    const authResults = yield* FrontendAuthResults;
    const systemWorker = yield* SystemWorkerApi;

    return yield* makeAsync(() =>
      systemWorker.pushCommands({
        accountId: authResults.actor.accountId,
        accountName: authResults.accountName,
        actorId: authResults.actor.actorId,
        actorName: authResults.actorName,
        deployId: authResults.deployId,
        frontendName: authResults.frontendName,
        generationId: authResults.generationId,
        commands: props.commands,
      }),
    ).pipe(Effect.flatMap(decodeRpc));
  },
);

const pushCommandsApiHandler = makeApiHandler({
  name: 'FrontendApi.pushCommands',
  argsSchema: Schema.mutable(
    Schema.Tuple(
      Schema.Struct({
        commands: Schema.Array(StagedCommandSchema),
      }),
    ),
  ),
  handler: pushCommands,
});

const executeServiceQuery = Effect.fn('FrontendApi.executeServiceQuery', {
  root: true,
})(function* (props: {
  serviceName: string;
  queryName: string;
  params: unknown;
}) {
  const authResults = yield* FrontendAuthResults;
  const systemWorker = yield* SystemWorkerApi;

  return yield* makeAsync(() =>
    systemWorker.executeServiceQuery({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
      params: props.params,
      queryName: props.queryName,
      serviceName: props.serviceName,
    }),
  ).pipe(
    Effect.flatMap(decodeRpc),
  );
});

const executeServiceQueryApiHandler = makeApiHandler({
  name: 'FrontendApi.executeServiceQuery',
  argsSchema: Schema.mutable(
    Schema.Tuple(
      Schema.Struct({
        serviceName: Schema.String,
        queryName: Schema.String,
        params: Schema.Unknown,
      }),
    ),
  ),
  handler: executeServiceQuery,
});

const executeActorQuery = Effect.fn('FrontendApi.executeActorQuery', {
  root: true,
})(function* (props: { queryName: string; params: unknown }) {
  const authResults = yield* FrontendAuthResults;
  const systemWorker = yield* SystemWorkerApi;

  return yield* makeAsync(() =>
    systemWorker.executeActorQuery({
      accountName: authResults.accountName,
      actorId: authResults.actor.actorId,
      actorName: authResults.actorName,
      deployId: authResults.deployId,
      generationId: authResults.generationId,
      params: props.params,
      queryName: props.queryName,
      frontendName: authResults.frontendName,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
});

const executeActorQueryApiHandler = makeApiHandler({
  name: 'FrontendApi.executeActorQuery',
  argsSchema: Schema.mutable(
    Schema.Tuple(
      Schema.Struct({
        queryName: Schema.String,
        params: Schema.Unknown,
      }),
    ),
  ),
  handler: executeActorQuery,
});

const makeFrontendSpec = Effect.fn('FrontendApi.makeFrontendSpec', {
  root: true,
})(function* () {
  const authResults = yield* FrontendAuthResults;
  const systemWorker = yield* SystemWorkerApi;

  return yield* makeAsync(() =>
    systemWorker.getFrontendSpec({
      accountName: authResults.accountName,
      actorName: authResults.actorName,
      deployId: authResults.deployId,
      frontendName: authResults.frontendName,
      generationId: authResults.generationId,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
});

const makeFrontendSpecApiHandler = makeApiHandler({
  name: 'FrontendApi.makeFrontendSpec',
  argsSchema: Schema.mutable(Schema.Tuple()),
  handler: makeFrontendSpec,
});

const getFrontendState = Effect.fn('FrontendApi.getFrontendState', {
  root: true,
})(function* () {
  const authResults = yield* FrontendAuthResults;
  const systemWorker = yield* SystemWorkerApi;

  return yield* makeAsync(() =>
    systemWorker.getFrontendState({
      accountId: authResults.actor.accountId,
      accountName: authResults.accountName,
      actorId: authResults.actor.actorId,
      actorName: authResults.actorName,
      deployId: authResults.deployId,
      frontendName: authResults.frontendName,
      generationId: authResults.generationId,
      systemWorkerName: authResults.systemWorkerName,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
});

const getFrontendStateApiHandler = makeApiHandler({
  name: 'FrontendApi.getFrontendState',
  argsSchema: Schema.mutable(Schema.Tuple()),
  handler: getFrontendState,
});

export class FrontendApi extends RpcTarget {
  declare [BrandTypeId]: 'TargetApi';

  readonly #authResults: {
    readonly actor: IActor;
    readonly accountName: string;
    readonly actorName: string;
    readonly deployId: string;
    readonly frontendName: string;
    readonly generationId: string;
    readonly systemId: ISystemId;
    readonly systemWorkerName: string;
    readonly systemEnvironmentId: ISystemEnvironmentId;
  };
  readonly #runtime: IDispatchRuntime;

  constructor(props: {
    authResults: {
      readonly actor: IActor;
      readonly accountName: string;
      readonly actorName: string;
      readonly deployId: string;
      readonly frontendName: string;
      readonly generationId: string;
      readonly systemId: ISystemId;
      readonly systemWorkerName: string;
      readonly systemEnvironmentId: ISystemEnvironmentId;
    };
    runtime: IDispatchRuntime;
  }) {
    super();
    this.#authResults = props.authResults;
    this.#runtime = props.runtime;
  }

  async fetchActor(
    request: IRpcRequest<[]>,
  ): Promise<
    ILinkedRpcEnvelope<
      {
        actor: IActor;
        deployId: string;
        generationId: string;
        systemId: ISystemId;
        systemVersion: string;
        systemWorkerName: string;
        systemEnvironmentId: ISystemEnvironmentId;
      },
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      fetchActorApiHandler(request).pipe(
        Effect.provideService(FrontendAuthResults, this.#authResults),
      ),
    );
  }

  async pushCommands(
    request: IRpcRequest<
      [
        {
          readonly commands: readonly IEncodedCommand<IStagedCommand>[];
        },
      ]
    >,
  ): Promise<
    ILinkedRpcEnvelope<
      {
        pendingCommands: readonly IEncodedCommand<IPushedCommand>[];
        pushedCommands: readonly IEncodedCommand<IPushedCommand>[];
        failedCommands: readonly IEncodedCommand<IFailedStagedCommand>[];
      },
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      pushCommandsApiHandler(request).pipe(
        Effect.provideService(FrontendAuthResults, this.#authResults),
      ),
    );
  }

  async executeServiceQuery(
    request: IRpcRequest<
      [
        {
          serviceName: string;
          queryName: string;
          params: unknown;
        },
      ]
    >,
  ): Promise<ILinkedRpcEnvelope<unknown, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      executeServiceQueryApiHandler(request).pipe(
        Effect.provideService(FrontendAuthResults, this.#authResults),
      ),
    );
  }

  async executeActorQuery(
    request: IRpcRequest<[{ queryName: string; params: unknown }]>,
  ): Promise<ILinkedRpcEnvelope<unknown, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      executeActorQueryApiHandler(request).pipe(
        Effect.provideService(FrontendAuthResults, this.#authResults),
      ),
    );
  }

  async makeFrontendSpec(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<IFrontendControllerSpec, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      makeFrontendSpecApiHandler(request).pipe(
        Effect.provideService(FrontendAuthResults, this.#authResults),
      ),
    );
  }

  async getFrontendState(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<IFrontendState, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getFrontendStateApiHandler(request).pipe(
        Effect.provideService(FrontendAuthResults, this.#authResults),
      ),
    );
  }
}
