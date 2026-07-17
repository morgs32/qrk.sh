import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  EncodedExecutedAccountCommandSchema,
  EncodedFailedAccountCommandSchema,
  UnknownServiceCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import type {
  IAccountCommand,
  IEncodedAppliedMutation,
  IEncodedCommand,
  IExecutedAccountCommand,
  IExecutedServiceCommand,
  IFailedAccountCommand,
  IFailedServiceCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import type {
  IAccountCursor,
  IAccountId,
  IActorId,
} from '@zerospin/core/models/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IFrontendState } from '@zerospin/core/session/types';
import type {
  IEncodedQuery,
  IRepoRegistration,
  IRepoTableData,
  ISystemId,
  ISystemSpec,
} from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import {
  makeSpanLinkId,
  makeTelemetryCollector,
  makeTelemetryLayer,
  makeTraceableRpcTarget,
  type ILinkedRpcEnvelope,
  type IRpcRequest,
  type ISpanLinkRecord,
} from '@zerospin/logger';
import { RpcTarget } from 'capnweb';
import { Context, Effect, Either, Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import type { SystemWorker } from 'system-worker';

import type { IDispatchRuntime } from '../makeDispatchRuntime';
import { retryTransientDoErrors } from '../retryTransientDoErrors';
import { SystemWorkerResolver } from '../SystemWorkerResolver/SystemWorkerResolver';

class SystemApiAuthResults extends Context.Tag('SystemApiAuthResults')<
  SystemApiAuthResults,
  {
    readonly deployId: string;
    readonly generationId: string;
    readonly systemId: ISystemId;
    readonly systemWorkerName: string;
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
        Effect.annotateSpans({
          deployId: authResults.deployId,
          generationId: authResults.generationId,
          systemId: authResults.systemId,
        }),
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

const hello = Effect.fn('SystemApi.hello', { root: true })(function* () {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  return yield* makeAsync(() =>
    systemWorker.hello({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
    }),
  ).pipe(
    Effect.flatMap(decodeRpc),
  );
});

const getFrontendState = Effect.fn('SystemApi.getFrontendState', {
  root: true,
})(function* (props: {
  accountId: string;
  accountName: string;
  actorId: IActorId;
  actorName: string;
  frontendName: string;
}) {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;

  return yield* makeAsync(() =>
    systemWorker.getFrontendState({
      accountId: props.accountId,
      accountName: props.accountName,
      actorId: props.actorId,
      actorName: props.actorName,
      deployId: authResults.deployId,
      frontendName: props.frontendName,
      generationId: authResults.generationId,
      systemWorkerName: authResults.systemWorkerName,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
});

const executeServiceQuery = Effect.fn('SystemApi.executeServiceQuery', {
  root: true,
})(function* (props: {
  serviceName: string;
  queryName: string;
  params: unknown;
}) {
  const authResults = yield* SystemApiAuthResults;
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

const finalizeAccountCommands = Effect.fn(
  'SystemApi.finalizeAccountCommands',
  { root: true },
)(function* (props: {
  accountId: IAccountId;
  accountName: string;
  commands: readonly IAccountCommand[];
}) {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const tracedSystemWorker = makeTraceableRpcTarget(systemWorker);
  const block = yield* tracedSystemWorker
    .finalizeAccountBlock({
      accountId: props.accountId,
      accountName: props.accountName,
      commands: props.commands,
      deployId: authResults.deployId,
      generationId: authResults.generationId,
    })
    .pipe(
      Effect.mapError(error =>
        error instanceof Error
          ? new ZerospinError({
              code: 'system-worker-finalize-rpc-failed',
              message: error.message,
              cause: ZerospinError.prettyUnknownFailure(error),
            })
          : Schema.decodeUnknownSync(ZerospinError.schema)(error),
      ),
      retryTransientDoErrors,
    );

  if (block.pushedBlockId !== null) {
    return yield* new ZerospinError({
      code: 'system-api-account-finalize-returned-pushed-block',
      message: 'Direct account finalization returned a frontend pushed block',
    });
  }

  const executedCommands = yield* Schema.validate(
    Schema.Array(EncodedExecutedAccountCommandSchema),
  )(block.executedCommands).pipe(
    mapParseError({
      code: 'system-api-account-finalize-executed-commands-invalid',
      prefix: 'Direct account finalization returned non-account executed commands',
    }),
  );
  const failedCommands = yield* Schema.validate(
    Schema.Array(EncodedFailedAccountCommandSchema),
  )(block.failedCommands).pipe(
    mapParseError({
      code: 'system-api-account-finalize-failed-commands-invalid',
      prefix: 'Direct account finalization returned non-account failed commands',
    }),
  );

  return {
    executedCommands,
    failedCommands,
    appliedMutations: block.appliedMutations,
    lastAccountCursor: block.lastAccountCursor,
    accountIndex: block.accountIndex,
    failure: block.failure,
  };
});

const executeSelectQuery = Effect.fn('SystemApi.executeSelectQuery', {
  root: true,
})(function* (props: {
  accountId: IAccountId;
  accountName: string;
  query: IEncodedQuery;
}) {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const encoded = yield* makeAsync(() =>
    systemWorker.executeSelectQuery({
      accountId: props.accountId,
      accountName: props.accountName,
      deployId: authResults.deployId,
      generationId: authResults.generationId,
      query: props.query,
    }),
  ).pipe(retryTransientDoErrors);
  return yield* decodeRpc(encoded);
});

const finalizeServiceCommands = Effect.fn(
  'SystemApi.finalizeServiceCommands',
  { root: true },
)(function* (props: {
  serviceName: string;
  commands: readonly IServiceCommand[];
}) {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const finalization = yield* makeAsync(() =>
    systemWorker.finalizeServiceCommands({
      commands: props.commands,
      deployId: authResults.deployId,
      generationId: authResults.generationId,
      serviceName: props.serviceName,
    }),
  ).pipe(Effect.flatMap(decodeRpc), retryTransientDoErrors);

  return {
    executed: finalization.executedCommands,
    failed: finalization.failedCommands,
  };
});

const getSystemRepos = Effect.fn('SystemApi.getSystemRepos', { root: true })(
  function* () {
    const authResults = yield* SystemApiAuthResults;
    const systemWorker = yield* SystemWorkerApi;
    const encoded = yield* makeAsync(() =>
      systemWorker.getSystemRepos({
        deployId: authResults.deployId,
        generationId: authResults.generationId,
      }),
    ).pipe(retryTransientDoErrors);
    return yield* decodeRpc(encoded);
  },
);

const getSystemRepoTableRows = Effect.fn(
  'SystemApi.getSystemRepoTableRows',
  { root: true },
)(function* (props: { repoName: string; tableName: string }) {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const encoded = yield* makeAsync(() =>
    systemWorker.getSystemRepoTableRows({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
      repoName: props.repoName,
      tableName: props.tableName,
    }),
  ).pipe(retryTransientDoErrors);
  return yield* decodeRpc(encoded);
});

const getAccountRepos = Effect.fn('SystemApi.getAccountRepos', {
  root: true,
})(function* () {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const encoded = yield* makeAsync(() =>
    systemWorker.getAccountRepos({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
    }),
  ).pipe(retryTransientDoErrors);
  return yield* decodeRpc(encoded);
});

const getAccountRepoTableRows = Effect.fn(
  'SystemApi.getAccountRepoTableRows',
  { root: true },
)(function* (props: { repoName: string; tableName: string }) {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const encoded = yield* makeAsync(() =>
    systemWorker.getAccountRepoTableRows({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
      repoName: props.repoName,
      tableName: props.tableName,
    }),
  ).pipe(retryTransientDoErrors);
  return yield* decodeRpc(encoded);
});

const getAuthorizationRepos = Effect.fn('SystemApi.getAuthorizationRepos', {
  root: true,
})(function* () {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const encoded = yield* makeAsync(() =>
    systemWorker.getAuthorizationRepos({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
    }),
  ).pipe(retryTransientDoErrors);
  return yield* decodeRpc(encoded);
});

const getAuthorizationRepoTableRows = Effect.fn(
  'SystemApi.getAuthorizationRepoTableRows',
  { root: true },
)(function* (props: { repoName: string; tableName: string }) {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const encoded = yield* makeAsync(() =>
    systemWorker.getAuthorizationRepoTableRows({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
      repoName: props.repoName,
      tableName: props.tableName,
    }),
  ).pipe(retryTransientDoErrors);
  return yield* decodeRpc(encoded);
});

const getActorRepos = Effect.fn('SystemApi.getActorRepos', { root: true })(
  function* () {
    const authResults = yield* SystemApiAuthResults;
    const systemWorker = yield* SystemWorkerApi;
    const encoded = yield* makeAsync(() =>
      systemWorker.getActorRepos({
        deployId: authResults.deployId,
        generationId: authResults.generationId,
      }),
    ).pipe(retryTransientDoErrors);
    return yield* decodeRpc(encoded);
  },
);

const getActorRepoTableRows = Effect.fn(
  'SystemApi.getActorRepoTableRows',
  { root: true },
)(function* (props: { repoName: string; tableName: string }) {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const encoded = yield* makeAsync(() =>
    systemWorker.getActorRepoTableRows({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
      repoName: props.repoName,
      tableName: props.tableName,
    }),
  ).pipe(retryTransientDoErrors);
  return yield* decodeRpc(encoded);
});

const getFrontendRepos = Effect.fn('SystemApi.getFrontendRepos', {
  root: true,
})(function* () {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const encoded = yield* makeAsync(() =>
    systemWorker.getFrontendRepos({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
    }),
  ).pipe(retryTransientDoErrors);
  return yield* decodeRpc(encoded);
});

const getFrontendRepoTableRows = Effect.fn(
  'SystemApi.getFrontendRepoTableRows',
  { root: true },
)(function* (props: { repoName: string; tableName: string }) {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const encoded = yield* makeAsync(() =>
    systemWorker.getFrontendRepoTableRows({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
      repoName: props.repoName,
      tableName: props.tableName,
    }),
  ).pipe(retryTransientDoErrors);
  return yield* decodeRpc(encoded);
});

const getServiceRepos = Effect.fn('SystemApi.getServiceRepos', { root: true })(
  function* () {
    const authResults = yield* SystemApiAuthResults;
    const systemWorker = yield* SystemWorkerApi;
    const encoded = yield* makeAsync(() =>
      systemWorker.getServiceRepos({
        deployId: authResults.deployId,
        generationId: authResults.generationId,
      }),
    ).pipe(retryTransientDoErrors);
    return yield* decodeRpc(encoded);
  },
);

const getServiceRepoTableRows = Effect.fn(
  'SystemApi.getServiceRepoTableRows',
  { root: true },
)(function* (props: { repoName: string; tableName: string }) {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const encoded = yield* makeAsync(() =>
    systemWorker.getServiceRepoTableRows({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
      repoName: props.repoName,
      tableName: props.tableName,
    }),
  ).pipe(retryTransientDoErrors);
  return yield* decodeRpc(encoded);
});

const getAccountBlockRepos = Effect.fn('SystemApi.getAccountBlockRepos', {
  root: true,
})(function* () {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const encoded = yield* makeAsync(() =>
    systemWorker.getAccountBlockRepos({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
    }),
  ).pipe(retryTransientDoErrors);
  return yield* decodeRpc(encoded);
});

const getAccountBlockRepoTableRows = Effect.fn(
  'SystemApi.getAccountBlockRepoTableRows',
  { root: true },
)(function* (props: { repoName: string; tableName: string }) {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const encoded = yield* makeAsync(() =>
    systemWorker.getAccountBlockRepoTableRows({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
      repoName: props.repoName,
      tableName: props.tableName,
    }),
  ).pipe(retryTransientDoErrors);
  return yield* decodeRpc(encoded);
});

const getActorBlockRepos = Effect.fn('SystemApi.getActorBlockRepos', {
  root: true,
})(function* () {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const encoded = yield* makeAsync(() =>
    systemWorker.getActorBlockRepos({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
    }),
  ).pipe(retryTransientDoErrors);
  return yield* decodeRpc(encoded);
});

const getActorBlockRepoTableRows = Effect.fn(
  'SystemApi.getActorBlockRepoTableRows',
  { root: true },
)(function* (props: { repoName: string; tableName: string }) {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const encoded = yield* makeAsync(() =>
    systemWorker.getActorBlockRepoTableRows({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
      repoName: props.repoName,
      tableName: props.tableName,
    }),
  ).pipe(retryTransientDoErrors);
  return yield* decodeRpc(encoded);
});

const getFrontendBlockRepos = Effect.fn('SystemApi.getFrontendBlockRepos', {
  root: true,
})(function* () {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const encoded = yield* makeAsync(() =>
    systemWorker.getFrontendBlockRepos({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
    }),
  ).pipe(retryTransientDoErrors);
  return yield* decodeRpc(encoded);
});

const getFrontendBlockRepoTableRows = Effect.fn(
  'SystemApi.getFrontendBlockRepoTableRows',
  { root: true },
)(function* (props: { repoName: string; tableName: string }) {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const encoded = yield* makeAsync(() =>
    systemWorker.getFrontendBlockRepoTableRows({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
      repoName: props.repoName,
      tableName: props.tableName,
    }),
  ).pipe(retryTransientDoErrors);
  return yield* decodeRpc(encoded);
});

const getServiceBlockRepos = Effect.fn('SystemApi.getServiceBlockRepos', {
  root: true,
})(function* () {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const encoded = yield* makeAsync(() =>
    systemWorker.getServiceBlockRepos({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
    }),
  ).pipe(retryTransientDoErrors);
  return yield* decodeRpc(encoded);
});

const getServiceBlockRepoTableRows = Effect.fn(
  'SystemApi.getServiceBlockRepoTableRows',
  { root: true },
)(function* (props: { repoName: string; tableName: string }) {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const encoded = yield* makeAsync(() =>
    systemWorker.getServiceBlockRepoTableRows({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
      repoName: props.repoName,
      tableName: props.tableName,
    }),
  ).pipe(retryTransientDoErrors);
  return yield* decodeRpc(encoded);
});

const getSystemLogRepos = Effect.fn('SystemApi.getSystemLogRepos', { root: true })(
  function* () {
    const authResults = yield* SystemApiAuthResults;
    const systemWorker = yield* SystemWorkerApi;
    const encoded = yield* makeAsync(() =>
      systemWorker.getSystemLogRepos({
        deployId: authResults.deployId,
        generationId: authResults.generationId,
      }),
    ).pipe(retryTransientDoErrors);
    return yield* decodeRpc(encoded);
  },
);

const getSystemLogRepoTableRows = Effect.fn(
  'SystemApi.getSystemLogRepoTableRows',
  { root: true },
)(function* (props: { repoName: string; tableName: string }) {
  const authResults = yield* SystemApiAuthResults;
  const systemWorker = yield* SystemWorkerApi;
  const encoded = yield* makeAsync(() =>
    systemWorker.getSystemLogRepoTableRows({
      deployId: authResults.deployId,
      generationId: authResults.generationId,
      repoName: props.repoName,
      tableName: props.tableName,
    }),
  ).pipe(retryTransientDoErrors);
  return yield* decodeRpc(encoded);
});

const makeSystemSpec = Effect.fn('SystemApi.makeSystemSpec', { root: true })(
  function* () {
    const authResults = yield* SystemApiAuthResults;
    const systemWorker = yield* SystemWorkerApi;
    return yield* makeAsync(() =>
      systemWorker.getSystemSpec({
        deployId: authResults.deployId,
        generationId: authResults.generationId,
      }),
    ).pipe(
      Effect.flatMap(decodeRpc),
    );
  },
);

/** HTTP RPC stubs resolve the SystemWorker per-call through SystemWorkerResolver. */
export class SystemApi extends RpcTarget {
  declare [BrandTypeId]: 'TargetApi';

  readonly #authResults: {
    readonly deployId: string;
    readonly generationId: string;
    readonly systemId: ISystemId;
    readonly systemWorkerName: string;
  };
  readonly #runtime: IDispatchRuntime;

  constructor(props: {
    deployId: string;
    generationId: string;
    systemId: ISystemId;
    systemWorkerName: string;
    runtime: IDispatchRuntime;
  }) {
    super();
    this.#authResults = {
      deployId: props.deployId,
      generationId: props.generationId,
      systemId: props.systemId,
      systemWorkerName: props.systemWorkerName,
    };
    this.#runtime = props.runtime;
  }

  async hello(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<string, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.hello',
        argsSchema: Schema.mutable(Schema.Tuple()),
        handler: hello,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  /**
   * Admin/tooling optimistic frontend state load: `SystemWorker.getFrontendState` → `FrontendRepo`.
   */
  async getFrontendState(
    request: IRpcRequest<
      [
        {
          accountId: string;
          accountName: string;
          actorId: IActorId;
          actorName: string;
          frontendName: string;
        },
      ]
    >,
  ): Promise<ILinkedRpcEnvelope<IFrontendState, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getFrontendState',
        argsSchema: Schema.mutable(
          Schema.Tuple(
            Schema.Struct({
              accountId: Schema.String,
              accountName: Schema.String,
              actorId: makeAbbreviationIdSchema('actr'),
              actorName: Schema.String,
              frontendName: Schema.String,
            }),
          ),
        ),
        handler: getFrontendState,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
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
      makeApiHandler({
        name: 'SystemApi.executeServiceQuery',
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
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  /** Account commands enter the account ledger and graph. */
  async finalizeAccountCommands(
    request: IRpcRequest<
      [
        {
          accountId: IAccountId;
          accountName: string;
          commands: readonly IAccountCommand[];
        },
      ]
    >,
  ): Promise<
    ILinkedRpcEnvelope<
      Readonly<{
        executedCommands: readonly IEncodedCommand<IExecutedAccountCommand>[];
        failedCommands: readonly IEncodedCommand<IFailedAccountCommand>[];
        appliedMutations: readonly IEncodedAppliedMutation[];
        lastAccountCursor: IAccountCursor;
        accountIndex: number;
        failure: IAnyError | null;
      }>,
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.finalizeAccountCommands',
        argsSchema: Schema.mutable(
          Schema.Tuple(
            Schema.Struct({
              accountId: makeAbbreviationIdSchema('acct'),
              accountName: Schema.String,
              commands: Schema.Array(
                Schema.Struct({
                  id: makeAbbreviationIdSchema('cmd'),
                  commandName: Schema.String,
                  payload: Schema.Unknown,
                  version: Schema.String,
                  commandType: Schema.Literal('account'),
                  accountId: Schema.String,
                  accountName: Schema.String,
                  systemName: Schema.String,
                  systemVersion: Schema.String,
                  sessionId: Schema.NullOr(
                    makeAbbreviationIdSchema('sesn'),
                  ),
                  actorId: Schema.NullOr(Schema.String),
                  actorName: Schema.NullOr(Schema.String),
                  frontendName: Schema.NullOr(Schema.String),
                  pushedCursor: Schema.NullOr(
                    makeAbbreviationIdSchema('pcur'),
                  ),
                }),
              ),
            }),
          ),
        ),
        handler: finalizeAccountCommands,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  /** Select-only SQL against account SQLite: `SystemWorker.executeSelectQuery` → `AccountRepo`. */
  async executeSelectQuery(
    request: IRpcRequest<
      [
        {
          accountId: IAccountId;
          accountName: string;
          query: IEncodedQuery;
        },
      ]
    >,
  ): Promise<ILinkedRpcEnvelope<unknown, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.executeSelectQuery',
        argsSchema: Schema.mutable(
          Schema.Tuple(
            Schema.Struct({
              accountId: makeAbbreviationIdSchema('acct'),
              accountName: Schema.String,
              query: Schema.Struct({
                method: Schema.Literal('all', 'get'),
                params: Schema.mutable(Schema.Array(Schema.Unknown)),
                rawSql: Schema.String,
              }),
            }),
          ),
        ),
        handler: executeSelectQuery,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async finalizeServiceCommands(
    request: IRpcRequest<
      [
        {
          serviceName: string;
          commands: readonly IServiceCommand[];
        },
      ]
    >,
  ): Promise<
    ILinkedRpcEnvelope<
      {
        executed: readonly IExecutedServiceCommand[];
        failed: readonly IFailedServiceCommand[];
      },
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.finalizeServiceCommands',
        argsSchema: Schema.mutable(
          Schema.Tuple(
            Schema.Struct({
              serviceName: Schema.String,
              commands: Schema.Array(UnknownServiceCommandSchema),
            }),
          ),
        ),
        handler: finalizeServiceCommands,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getSystemRepos(
    request: IRpcRequest<[]>,
  ): Promise<
    ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getSystemRepos',
        argsSchema: Schema.mutable(Schema.Tuple()),
        handler: getSystemRepos,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getSystemRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getSystemRepoTableRows',
        argsSchema: Schema.mutable(
          Schema.Tuple(
            Schema.Struct({
              repoName: Schema.String,
              tableName: Schema.String,
            }),
          ),
        ),
        handler: getSystemRepoTableRows,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getAccountRepos(
    request: IRpcRequest<[]>,
  ): Promise<
    ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getAccountRepos',
        argsSchema: Schema.mutable(Schema.Tuple()),
        handler: getAccountRepos,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getAccountRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getAccountRepoTableRows',
        argsSchema: Schema.mutable(
          Schema.Tuple(
            Schema.Struct({
              repoName: Schema.String,
              tableName: Schema.String,
            }),
          ),
        ),
        handler: getAccountRepoTableRows,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getAuthorizationRepos(
    request: IRpcRequest<[]>,
  ): Promise<
    ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getAuthorizationRepos',
        argsSchema: Schema.mutable(Schema.Tuple()),
        handler: getAuthorizationRepos,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getAuthorizationRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getAuthorizationRepoTableRows',
        argsSchema: Schema.mutable(
          Schema.Tuple(
            Schema.Struct({
              repoName: Schema.String,
              tableName: Schema.String,
            }),
          ),
        ),
        handler: getAuthorizationRepoTableRows,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getActorRepos(
    request: IRpcRequest<[]>,
  ): Promise<
    ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getActorRepos',
        argsSchema: Schema.mutable(Schema.Tuple()),
        handler: getActorRepos,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getActorRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getActorRepoTableRows',
        argsSchema: Schema.mutable(
          Schema.Tuple(
            Schema.Struct({
              repoName: Schema.String,
              tableName: Schema.String,
            }),
          ),
        ),
        handler: getActorRepoTableRows,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getFrontendRepos(
    request: IRpcRequest<[]>,
  ): Promise<
    ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getFrontendRepos',
        argsSchema: Schema.mutable(Schema.Tuple()),
        handler: getFrontendRepos,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getFrontendRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getFrontendRepoTableRows',
        argsSchema: Schema.mutable(
          Schema.Tuple(
            Schema.Struct({
              repoName: Schema.String,
              tableName: Schema.String,
            }),
          ),
        ),
        handler: getFrontendRepoTableRows,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getServiceRepos(
    request: IRpcRequest<[]>,
  ): Promise<
    ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getServiceRepos',
        argsSchema: Schema.mutable(Schema.Tuple()),
        handler: getServiceRepos,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getServiceRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getServiceRepoTableRows',
        argsSchema: Schema.mutable(
          Schema.Tuple(
            Schema.Struct({
              repoName: Schema.String,
              tableName: Schema.String,
            }),
          ),
        ),
        handler: getServiceRepoTableRows,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getAccountBlockRepos(
    request: IRpcRequest<[]>,
  ): Promise<
    ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getAccountBlockRepos',
        argsSchema: Schema.mutable(Schema.Tuple()),
        handler: getAccountBlockRepos,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getAccountBlockRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getAccountBlockRepoTableRows',
        argsSchema: Schema.mutable(
          Schema.Tuple(
            Schema.Struct({
              repoName: Schema.String,
              tableName: Schema.String,
            }),
          ),
        ),
        handler: getAccountBlockRepoTableRows,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getActorBlockRepos(
    request: IRpcRequest<[]>,
  ): Promise<
    ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getActorBlockRepos',
        argsSchema: Schema.mutable(Schema.Tuple()),
        handler: getActorBlockRepos,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getActorBlockRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getActorBlockRepoTableRows',
        argsSchema: Schema.mutable(
          Schema.Tuple(
            Schema.Struct({
              repoName: Schema.String,
              tableName: Schema.String,
            }),
          ),
        ),
        handler: getActorBlockRepoTableRows,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getFrontendBlockRepos(
    request: IRpcRequest<[]>,
  ): Promise<
    ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getFrontendBlockRepos',
        argsSchema: Schema.mutable(Schema.Tuple()),
        handler: getFrontendBlockRepos,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getFrontendBlockRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getFrontendBlockRepoTableRows',
        argsSchema: Schema.mutable(
          Schema.Tuple(
            Schema.Struct({
              repoName: Schema.String,
              tableName: Schema.String,
            }),
          ),
        ),
        handler: getFrontendBlockRepoTableRows,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getServiceBlockRepos(
    request: IRpcRequest<[]>,
  ): Promise<
    ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getServiceBlockRepos',
        argsSchema: Schema.mutable(Schema.Tuple()),
        handler: getServiceBlockRepos,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getServiceBlockRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getServiceBlockRepoTableRows',
        argsSchema: Schema.mutable(
          Schema.Tuple(
            Schema.Struct({
              repoName: Schema.String,
              tableName: Schema.String,
            }),
          ),
        ),
        handler: getServiceBlockRepoTableRows,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getSystemLogRepos(
    request: IRpcRequest<[]>,
  ): Promise<
    ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getSystemLogRepos',
        argsSchema: Schema.mutable(Schema.Tuple()),
        handler: getSystemLogRepos,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  async getSystemLogRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.getSystemLogRepoTableRows',
        argsSchema: Schema.mutable(
          Schema.Tuple(
            Schema.Struct({
              repoName: Schema.String,
              tableName: Schema.String,
            }),
          ),
        ),
        handler: getSystemLogRepoTableRows,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }

  /** Return deployed system spec snapshot. */
  async makeSystemSpec(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<ISystemSpec, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      makeApiHandler({
        name: 'SystemApi.makeSystemSpec',
        argsSchema: Schema.mutable(Schema.Tuple()),
        handler: makeSystemSpec,
      })(request).pipe(
        Effect.provideService(SystemApiAuthResults, this.#authResults),
      ),
    );
  }
}
