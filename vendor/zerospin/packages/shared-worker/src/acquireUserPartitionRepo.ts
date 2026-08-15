import type { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import type {
  IEncodedAggregateFrontendMutation,
  IEncodedCommand,
  IStagedSessionCommand,
} from '@zerospin/core/contracts/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import type { IAggregateId } from '@zerospin/core/models/types';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import type {
  IServiceFrontendReplicaBlock,
  IServiceFrontendReplicaState,
} from '@zerospin/core/serviceSession/types';
import type {
  IAggregateFrontendReplicaBlock,
  IAggregateFrontendReplicaState,
} from '@zerospin/core/session/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import type { IRpcTarget } from '@zerospin/core/utils/types';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { annotateFunctionSpan } from '@zerospin/logger';
import { newMessagePortRpcSession } from 'capnweb';
import { Effect, Either, Redacted, type Schema } from 'effect';

/** Main-thread aggregate replica delivery capability. */
export type AggregateFrontendReplicaSinkApi = IRpcTarget<{
  handleBlock(
    frontendReplicaBlock: IAggregateFrontendReplicaBlock,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
  replaceState(
    frontendReplicaState: IAggregateFrontendReplicaState,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
  handleFailure(
    failure: IAnyErrorJson,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
}>;

/** Main-thread service replica delivery capability. */
export type ServiceFrontendReplicaSinkApi = IRpcTarget<{
  handleBlock(
    serviceFrontendReplicaBlock: IServiceFrontendReplicaBlock,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
  replaceState(
    serviceFrontendReplicaState: IServiceFrontendReplicaState,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
  handleFailure(
    failure: IAnyErrorJson,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
}>;

/** User-bound SharedWorker replica capability. */
export type UserPartitionRepo = IRpcTarget<{
  acquireAggregateFrontendReplica(props: {
    aggregateId: IAggregateId;
    aggregateName: string;
    frontendName: string;
    aggregateFrontendLockKey: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
    frontendSpec: IFrontendControllerSpec;
    mode: 'online' | 'existing-only';
    sink: AggregateFrontendReplicaSinkApi;
  }): Promise<
    Schema.EitherEncoded<
      IRpcTarget<{
        getState(): Promise<
          Schema.EitherEncoded<IAggregateFrontendReplicaState, IAnyErrorJson>
        >;
        release(): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
      }>,
      IAnyErrorJson
    >
  >;
  acquireServiceFrontendReplica(props: {
    serviceName: string;
    frontendName: string;
    serviceFrontendLockKey: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
    frontendSpec: IFrontendControllerSpec;
    mode: 'online' | 'existing-only';
    sink: ServiceFrontendReplicaSinkApi;
  }): Promise<
    Schema.EitherEncoded<
      IRpcTarget<{
        getState(): Promise<
          Schema.EitherEncoded<IServiceFrontendReplicaState, IAnyErrorJson>
        >;
        release(): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
      }>,
      IAnyErrorJson
    >
  >;
  stageAggregateFrontendCommand(props: {
    target: Readonly<{
      aggregateId: IAggregateId;
      aggregateName: string;
      frontendName: string;
      aggregateFrontendLockKey: string;
    }>;
    sessionIndex: number;
    command: IEncodedCommand<IStagedSessionCommand>;
    mutations: readonly IEncodedAggregateFrontendMutation[];
  }): Promise<
    Schema.EitherEncoded<Readonly<{ commandId: string }>, IAnyErrorJson>
  >;
  getPushPaused(props: {
    aggregateId: IAggregateId;
    aggregateName: string;
    frontendName: string;
    aggregateFrontendLockKey: string;
  }): Promise<Schema.EitherEncoded<boolean, IAnyErrorJson>>;
  setPushPaused(props: {
    aggregateId: IAggregateId;
    aggregateName: string;
    frontendName: string;
    aggregateFrontendLockKey: string;
    pushPaused: boolean;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
  pushNow(props: {
    aggregateId: IAggregateId;
    aggregateName: string;
    frontendName: string;
    aggregateFrontendLockKey: string;
  }): Promise<
    Schema.EitherEncoded<
      | Readonly<{ status: 'empty' }>
      | Readonly<{ status: 'pushed' }>
      | Readonly<{ status: 'retry-exhausted'; failure: IAnyErrorJson }>,
      IAnyErrorJson
    >
  >;
  listAggregateFrontendReplicas(): Promise<
    Schema.EitherEncoded<
      readonly Readonly<{
        aggregateId: IAggregateId;
        aggregateName: string;
        userId: string;
        frontendName: string;
        aggregateFrontendLockKey: string;
        frontendSpec: IFrontendControllerSpec;
        aggregateFrontendLock: Schema.Schema.Type<
          typeof AggregateFrontendLockSchema
        >;
        databaseName: string;
        status: 'activating' | 'ready' | 'repairing' | 'failed';
        frontendIndex: number;
        replicaIndex: number;
        systemVersion: string;
        activeRegistrationCount: number;
        socketState: 'disconnected' | 'connecting' | 'replaying' | 'online';
        reconnectAttempt: number;
        pushInFlight: boolean;
        lastFailure: IAnyErrorJson | null;
      }>[],
      IAnyErrorJson
    >
  >;
  listServiceFrontendReplicas(): Promise<
    Schema.EitherEncoded<
      readonly Readonly<{
        serviceName: string;
        userId: string;
        frontendName: string;
        serviceFrontendLockKey: string;
        frontendSpec: IFrontendControllerSpec;
        serviceFrontendLock: Schema.Schema.Type<
          typeof ServiceFrontendLockSchema
        >;
        databaseName: string;
        status: 'activating' | 'ready' | 'failed';
        frontendIndex: number;
        replicaIndex: number;
        systemVersion: string;
        activeRegistrationCount: number;
        socketState: 'disconnected' | 'connecting' | 'replaying' | 'online';
        reconnectAttempt: number;
        lastFailure: IAnyErrorJson | null;
      }>[],
      IAnyErrorJson
    >
  >;
}>;

export const acquireUserPartitionRepo = Effect.fn('acquireUserPartitionRepo')(
  function* (props: {
    systemName: string;
    authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
    generateSignature(): Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>>;
  }): Effect.fn.Return<
    {
      api: UserPartitionRepo;
      release: Effect.Effect<void>;
      systemId: ISystemId;
      userId: string;
      mode: 'online' | 'existing-only';
    },
    IAnyError,
    PublishableKey | ZerospinApiUrl
  > {
    const apiUrl = yield* ZerospinApiUrl;
    const publishableKey = Redacted.value(yield* PublishableKey);

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
        // server route and emitted WASM URL in every bundler.
        const sharedWorkerUrl =
          `${sharedWorkerAssetUrl.href}?wasmUrl=${encodeURIComponent(sharedWorkerWasmAssetUrl.href)}` +
          `&apiUrl=${encodeURIComponent(apiUrl)}` +
          `&publishableKey=${encodeURIComponent(publishableKey)}`;

        const sharedWorker = new globalThis.SharedWorker(sharedWorkerUrl, {
          name: 'zerospin:shared-worker',
          type: 'module',
        });
        const port = sharedWorker.port;
        port.start();
        let sharedWorkerApi: ReturnType<
          typeof newMessagePortRpcSession<{
            getUserPartitionRepo(props: {
              systemName: string;
              authenticationLock: Schema.Schema.Type<
                typeof AuthenticationLockSchema
              >;
              generateSignature(): Promise<
                Schema.EitherEncoded<unknown, IAnyErrorJson>
              >;
            }): Promise<
              Schema.EitherEncoded<
                {
                  api: UserPartitionRepo;
                  systemId: ISystemId;
                  userId: string;
                  mode: 'online' | 'existing-only';
                },
                IAnyErrorJson
              >
            >;
          }>
        >;
        try {
          sharedWorkerApi = newMessagePortRpcSession<{
            getUserPartitionRepo(props: {
              systemName: string;
              authenticationLock: Schema.Schema.Type<
                typeof AuthenticationLockSchema
              >;
              generateSignature(): Promise<
                Schema.EitherEncoded<unknown, IAnyErrorJson>
              >;
            }): Promise<
              Schema.EitherEncoded<
                {
                  api: UserPartitionRepo;
                  systemId: ISystemId;
                  userId: string;
                  mode: 'online' | 'existing-only';
                },
                IAnyErrorJson
              >
            >;
          }>(port);
        } catch (cause) {
          port.close();
          throw cause;
        }

        let isRpcSessionDisposed = false;
        const handleSharedWorkerPortClose = (event?: Event) => {
          if (
            event !== undefined &&
            'persisted' in event &&
            event.persisted === true
          ) {
            return;
          }
          if (isRpcSessionDisposed) {
            return;
          }
          isRpcSessionDisposed = true;
          if (typeof globalThis.removeEventListener === 'function') {
            globalThis.removeEventListener(
              'pagehide',
              handleSharedWorkerPortClose,
            );
          }
          sharedWorkerApi[Symbol.dispose]();
          port.close();
        };
        port.addEventListener('close', handleSharedWorkerPortClose, {
          once: true,
        });
        if (typeof globalThis.addEventListener === 'function') {
          globalThis.addEventListener('pagehide', handleSharedWorkerPortClose);
        }

        let acquired: {
          api: UserPartitionRepo;
          systemId: ISystemId;
          userId: string;
          mode: 'online' | 'existing-only';
        };
        try {
          const decodedAcquisition = await Effect.runPromise(
            decodeRpc(
              await sharedWorkerApi.getUserPartitionRepo({
                systemName: props.systemName,
                authenticationLock: props.authenticationLock,
                generateSignature: props.generateSignature,
              }),
            ).pipe(Effect.either),
          );
          if (Either.isLeft(decodedAcquisition)) {
            throw decodedAcquisition.left;
          }
          acquired = decodedAcquisition.right;
        } catch (cause) {
          port.removeEventListener('close', handleSharedWorkerPortClose);
          if (typeof globalThis.removeEventListener === 'function') {
            globalThis.removeEventListener(
              'pagehide',
              handleSharedWorkerPortClose,
            );
          }
          handleSharedWorkerPortClose();
          throw cause;
        }

        return {
          ...acquired,
          release: Effect.sync(() => {
            port.removeEventListener('close', handleSharedWorkerPortClose);
            if (typeof globalThis.removeEventListener === 'function') {
              globalThis.removeEventListener(
                'pagehide',
                handleSharedWorkerPortClose,
              );
            }
            handleSharedWorkerPortClose();
          }),
        };
      },
      catch: cause =>
        ZerospinError.isZerospinError(cause)
          ? cause
          : new ZerospinError({
              code: 'failed-to-connect-shared-worker',
              message: 'Failed to connect to shared worker',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
    });
  },
  annotateFunctionSpan,
);
