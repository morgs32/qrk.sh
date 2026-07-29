import type {
  IEncodedCommand,
  IEncodedFrontendMutation,
  IFailedStagedCommand,
  IPushedCommand,
  IStagedCommand,
} from '@zerospin/core/contracts/types';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import type { IAccountId, IActorId } from '@zerospin/core/models/types';
import type { makeServiceFrontendControllerSpec } from '@zerospin/core/serviceFrontendController/makeServiceFrontendControllerSpec';
import type {
  IServiceFrontendLineageTransitionRequired,
  IServiceFrontendReplicaBlock,
  IServiceFrontendReplicaState,
  IServiceFrontendState,
} from '@zerospin/core/serviceSession/types';
import type {
  IFrontendReplicaBlock,
  IFrontendReplicaState,
  IFrontendSyncState,
} from '@zerospin/core/session/types';
import type { ISystemId } from '@zerospin/core/system/types';
import type { IRpcTarget } from '@zerospin/core/utils/types';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { annotateFunctionSpan } from '@zerospin/logger';
import { newMessagePortRpcSession } from 'capnweb';
import { Effect, type Schema } from 'effect';

/** Config-owned account capability passed into the SharedWorker. */
export type AccountFrontendReplicaProviderApi = IRpcTarget<{
  getFrontendState(): Promise<
    Schema.EitherEncoded<IFrontendSyncState, IAnyErrorJson>
  >;
  createFrontendWebSocketTicket(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        ticket: string;
        systemId: ISystemId;
        generationId: string;
        accountId: IAccountId;
        accountName: string;
        actorId: IActorId;
        actorName: string;
        frontendName: string;
        frontendVersion: string;
      }>,
      IAnyErrorJson
    >
  >;
  pushCommands(commands: readonly IEncodedCommand<IStagedCommand>[]): Promise<
    Schema.EitherEncoded<
      Readonly<{
        pendingCommands: readonly IEncodedCommand<IPushedCommand>[];
        pushedCommands: readonly IEncodedCommand<IPushedCommand>[];
        failedCommands: readonly IEncodedCommand<IFailedStagedCommand>[];
      }>,
      IAnyErrorJson
    >
  >;
  handleFrontendReplicaBlock(
    frontendReplicaBlock: IFrontendReplicaBlock,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
  replaceFrontendState(
    frontendReplicaState: IFrontendReplicaState,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
}>;

/** Config-owned read-only service capability passed into the SharedWorker. */
export type ServiceFrontendReplicaProviderApi = IRpcTarget<{
  getFrontendState(): Promise<
    Schema.EitherEncoded<IServiceFrontendState, IAnyErrorJson>
  >;
  createFrontendWebSocketTicket(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        ticket: string;
        systemId: ISystemId;
        generationId: string;
        serviceName: string;
        actorId: IActorId;
        actorName: string;
        frontendName: string;
        frontendVersion: string;
      }>,
      IAnyErrorJson
    >
  >;
  handleServiceFrontendReplicaBlock(
    serviceFrontendReplicaBlock: IServiceFrontendReplicaBlock,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
  replaceFrontendState(
    serviceFrontendReplicaState: IServiceFrontendReplicaState,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
}>;

/** Generation/partition-bound SharedWorker capability. */
export type PartitionApi = IRpcTarget<{
  acquireFrontendReplica(props: {
    accountId: IAccountId;
    accountName: string;
    actorId: IActorId;
    actorName: string;
    frontendName: string;
    frontendVersion: string;
    frontendSpec: IFrontendControllerSpec;
    frontendSpecHash: string;
    authority: 'online' | 'cached-offline';
    role: 'active' | 'commissioned';
    provider: AccountFrontendReplicaProviderApi;
  }): Promise<
    Schema.EitherEncoded<
      IRpcTarget<{
        getFrontendState(): Promise<
          Schema.EitherEncoded<IFrontendReplicaState, IAnyErrorJson>
        >;
        release(): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
      }>,
      IAnyErrorJson
    >
  >;
  acquireServiceFrontendReplica(props: {
    serviceName: string;
    actorId: IActorId;
    actorName: string;
    frontendName: string;
    frontendVersion: string;
    frontendSpec: ReturnType<typeof makeServiceFrontendControllerSpec>;
    frontendSpecHash: string;
    authority: 'online' | 'cached-offline';
    role: 'active' | 'commissioned';
    provider: ServiceFrontendReplicaProviderApi;
  }): Promise<
    Schema.EitherEncoded<
      IRpcTarget<{
        getFrontendState(): Promise<
          Schema.EitherEncoded<IServiceFrontendReplicaState, IAnyErrorJson>
        >;
        release(): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
      }>,
      IAnyErrorJson
    >
  >;
  stageFrontendCommand(props: {
    target: Readonly<{
      accountId: IAccountId;
      accountName: string;
      actorId: IActorId;
      actorName: string;
      frontendName: string;
      frontendVersion: string;
    }>;
    baseReplicaIndex: number;
    command: IEncodedCommand<IStagedCommand>;
    mutations: readonly IEncodedFrontendMutation[];
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{ commandId: string; replicaIndex: number }>,
      IAnyErrorJson
    >
  >;
  getDormantFrontendCommands(props: {
    sourceTarget: Readonly<{
      generationId: string;
      accountId: IAccountId;
      accountName: string;
      actorId: IActorId;
      actorName: string;
      frontendName: string;
      frontendVersion: string;
    }>;
    targetFrontendVersion: string;
  }): Promise<
    Schema.EitherEncoded<
      readonly Readonly<{
        command: IEncodedCommand<IStagedCommand>;
        mutations: readonly IEncodedFrontendMutation[];
      }>[],
      IAnyErrorJson
    >
  >;
  importAdaptedFrontendCommands(props: {
    target: Readonly<{
      accountId: IAccountId;
      accountName: string;
      actorId: IActorId;
      actorName: string;
      frontendName: string;
      frontendVersion: string;
    }>;
    sourceTarget: Readonly<{
      generationId: string;
      accountId: IAccountId;
      accountName: string;
      actorId: IActorId;
      actorName: string;
      frontendName: string;
      frontendVersion: string;
    }>;
    baseReplicaIndex: number;
    commands: readonly Readonly<{
      sourceCommand: IEncodedCommand<IStagedCommand>;
      adaptedCommand: IEncodedCommand<IStagedCommand>;
      mutations: readonly IEncodedFrontendMutation[];
    }>[];
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{ commandIds: readonly string[]; replicaIndex: number }>,
      IAnyErrorJson
    >
  >;
  markFrontendCommandsMigrated(props: {
    sourceTarget: Readonly<{
      accountId: IAccountId;
      accountName: string;
      actorId: IActorId;
      actorName: string;
      frontendName: string;
      frontendVersion: string;
    }>;
    target: Readonly<{
      generationId: string;
      accountId: IAccountId;
      accountName: string;
      actorId: IActorId;
      actorName: string;
      frontendName: string;
      frontendVersion: string;
    }>;
    commandIds: readonly string[];
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
  listAccountFrontendReplicas(): Promise<
    Schema.EitherEncoded<
      readonly Readonly<{
        accountId: string;
        accountName: string;
        actorId: string;
        actorName: string;
        frontendName: string;
        frontendVersion: string;
        databaseName: string;
        status: 'commissioning' | 'ready' | 'failed';
        role: 'active' | 'commissioned';
        frontendIndex: number;
        replicaIndex: number;
        activeProviderCount: number;
        socketState: 'disconnected' | 'connecting' | 'replaying' | 'online';
        reconnectAttempt: number;
        journalHealth: 'healthy' | 'unverified' | 'corrupt';
        hasPendingTransition: boolean;
        sourceTargets: readonly Readonly<{
          generationId: string;
          accountId: IAccountId;
          accountName: string;
          actorId: IActorId;
          actorName: string;
          frontendName: string;
          frontendVersion: string;
        }>[];
        lastFailure: IAnyErrorJson | null;
      }>[],
      IAnyErrorJson
    >
  >;
  listServiceFrontendReplicas(): Promise<
    Schema.EitherEncoded<
      readonly Readonly<{
        serviceName: string;
        actorId: string;
        actorName: string;
        frontendName: string;
        frontendVersion: string;
        databaseName: string;
        status: 'commissioning' | 'ready' | 'failed';
        role: 'active' | 'commissioned';
        frontendIndex: number;
        replicaIndex: number;
        activeProviderCount: number;
        socketState: 'disconnected' | 'connecting' | 'replaying' | 'online';
        reconnectAttempt: number;
        pendingTransition: IServiceFrontendLineageTransitionRequired | null;
        lastFailure: IAnyErrorJson | null;
      }>[],
      IAnyErrorJson
    >
  >;
}>;

export const makeSharedWorkerSession = Effect.fn('makeSharedWorkerSession')(
  function* (props: {
    systemId: ISystemId;
    generationId: string;
    apiUrl: string;
    publishableKey: string;
  }): Effect.fn.Return<
    {
      api: {
        getPartitionApi(props: { partitionKey: string }): Promise<PartitionApi>;
      };
      release: Effect.Effect<void>;
    },
    IAnyError
  > {
    const { systemId, generationId, apiUrl, publishableKey } = props;

    if (
      typeof globalThis.SharedWorker !== 'function' ||
      typeof globalThis.MessagePort !== 'function'
    ) {
      return yield* new ZerospinError({
        code: 'shared-worker-unavailable',
        message:
          'SharedWorker is not available; this browser is not compatible',
      });
    }

    return yield* Effect.tryPromise({
      try: async () => {
        const sharedWorkerAssetUrl = new URL(
          './sharedWorker.bundle.js',
          import.meta.url,
        );
        const sharedWorkerWasmAssetUrl = new URL(
          './wa-sqlite-async.wasm',
          import.meta.url,
        );

        // Turbopack replaces static asset URLs with a relative-URL shim whose
        // href does not change when its detached searchParams object is mutated.
        // Build the final string explicitly so the SharedWorker receives its
        // identity, server route, and emitted WASM URL in every bundler.
        const sharedWorkerUrl =
          `${sharedWorkerAssetUrl.href}?systemId=${encodeURIComponent(systemId)}` +
          `&generationId=${encodeURIComponent(generationId)}` +
          `&apiUrl=${encodeURIComponent(apiUrl)}` +
          `&wasmUrl=${encodeURIComponent(sharedWorkerWasmAssetUrl.href)}` +
          `&publishableKey=${encodeURIComponent(publishableKey)}`;

        const sharedWorker = new globalThis.SharedWorker(sharedWorkerUrl, {
          name: 'zerospin:shared-worker',
          type: 'module',
        });
        const port = sharedWorker.port;
        port.start();
        let api: ReturnType<
          typeof newMessagePortRpcSession<{
            getPartitionApi(props: {
              partitionKey: string;
            }): Promise<PartitionApi>;
          }>
        >;
        try {
          api = newMessagePortRpcSession<{
            getPartitionApi(props: {
              partitionKey: string;
            }): Promise<PartitionApi>;
          }>(port);
        } catch (cause) {
          port.close();
          throw cause;
        }

        let isRpcSessionDisposed = false;
        const handleSharedWorkerPortClose = () => {
          if (isRpcSessionDisposed) {
            return;
          }
          isRpcSessionDisposed = true;
          api[Symbol.dispose]();
        };
        port.addEventListener('close', handleSharedWorkerPortClose, {
          once: true,
        });

        return {
          api,
          release: Effect.sync(() => {
            port.removeEventListener('close', handleSharedWorkerPortClose);
            handleSharedWorkerPortClose();
            port.close();
          }),
        };
      },
      catch: cause =>
        new ZerospinError({
          code: 'failed-to-connect-shared-worker',
          message: 'Failed to connect to shared worker',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });
  },
  annotateFunctionSpan,
);
