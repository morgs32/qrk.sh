import { createContext } from 'react';

import { encodeFrontendMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import { makeMutations } from '@zerospin/core/contracts/makeMutations';
import type {
  IEncodedCommand,
  IEncodedFrontendMutation,
  IFailedStagedCommand,
  IPushedCommand,
  IStagedCommand,
} from '@zerospin/core/contracts/types';
import type {
  IFrontendController,
  IFrontendControllerSpec,
} from '@zerospin/core/frontendController/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { makeEffectSchema } from '@zerospin/core/models/primitiveMaps';
import type { IAccountId, IActorId } from '@zerospin/core/models/types';
import type { makeServiceFrontendControllerSpec } from '@zerospin/core/serviceFrontendController/makeServiceFrontendControllerSpec';
import type { IServiceFrontendController } from '@zerospin/core/serviceFrontendController/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type {
  IServiceFrontendReplicaBlock,
  IServiceFrontendReplicaState,
} from '@zerospin/core/serviceSession/types';
import type {
  IFrontendReplicaBlock,
  IFrontendReplicaState,
  ISessionId,
} from '@zerospin/core/session/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { ISignatureFactory } from '@zerospin/core/utils/types';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import {
  makeSharedWorkerSession,
  type AccountFrontendReplicaProviderApi,
  type PartitionApi,
  type ServiceFrontendReplicaProviderApi,
} from '@zerospin/shared-worker/makeSharedWorkerSession';
import { RpcTarget } from 'capnweb';
import { Duration, Effect, Either, Schema } from 'effect';
import { persist, type PersistStorage } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';

export type IFrontendAuthenticator =
  | Readonly<{
      frontend: Readonly<{
        kind: 'account';
        frontend: IFrontendController;
      }>;
      generateSignature: ISignatureFactory;
    }>
  | Readonly<{
      frontend: Readonly<{
        kind: 'service';
        frontend: IServiceFrontendController;
      }>;
      generateSignature: ISignatureFactory;
    }>;

export type IAccountFrontendReplicaNetwork = Pick<
  AccountFrontendReplicaProviderApi,
  'getFrontendState' | 'createFrontendWebSocketTicket' | 'pushCommands'
> &
  Readonly<{
    releaseFrontendApi?(): void;
  }>;

export type IServiceFrontendReplicaNetwork = Pick<
  ServiceFrontendReplicaProviderApi,
  'getFrontendState' | 'createFrontendWebSocketTicket'
> &
  Readonly<{
    releaseFrontendApi?(): void;
  }>;

type IRpcSuccess<METHOD extends (...args: never[]) => unknown> =
  Awaited<ReturnType<METHOD>> extends Schema.EitherEncoded<
    infer SUCCESS,
    IAnyErrorJson
  >
    ? SUCCESS
    : never;

type IAcquiredAccountFrontendReplicaApi = IRpcSuccess<
  PartitionApi['acquireFrontendReplica']
>;

type IAcquiredServiceFrontendReplicaApi = IRpcSuccess<
  PartitionApi['acquireServiceFrontendReplica']
>;

type IAccountSessionRegistration = {
  sessionId: ISessionId;
  replicaIndex: number | null;
  isHydrated: boolean;
  isRepairing: boolean;
  isRepairScheduled: boolean;
  isReleased: boolean;
  releaseError: IAnyError | null;
  operation: Promise<void>;
  queuedBlocks: IFrontendReplicaBlock[];
  handleFrontendReplicaBlock(
    frontendReplicaBlock: IFrontendReplicaBlock,
  ): Promise<void>;
  replaceFrontendState(
    frontendReplicaState: IFrontendReplicaState,
  ): Promise<void>;
  setDatabaseName(databaseName: string): void;
  setOnline(): void;
  setRepairing(): void;
  setUpdateRequired(): void;
  setFailure(error: unknown): void;
  teardown(error: IAnyError | null): Promise<void>;
};

type IServiceSessionRegistration = {
  sessionId: ISessionId;
  replicaIndex: number | null;
  isHydrated: boolean;
  isRepairing: boolean;
  isRepairScheduled: boolean;
  isReleased: boolean;
  releaseError: IAnyError | null;
  operation: Promise<void>;
  queuedBlocks: IServiceFrontendReplicaBlock[];
  handleServiceFrontendReplicaBlock(
    serviceFrontendReplicaBlock: IServiceFrontendReplicaBlock,
  ): Promise<void>;
  replaceFrontendState(
    serviceFrontendReplicaState: IServiceFrontendReplicaState,
  ): Promise<void>;
  setDatabaseName(databaseName: string): void;
  setOnline(): void;
  setRepairing(): void;
  setUpdateRequired(): void;
  setFailure(error: unknown): void;
  teardown(error: IAnyError | null): Promise<void>;
};

type IWorkerRoot = {
  id: string;
  systemId: ISystemId;
  generationId: string;
  apiUrl: string;
  publishableKey: string;
  partitionApi: PartitionApi;
  release: Effect.Effect<void>;
};

type IAccountReplicaEntry = {
  key: string;
  root: IWorkerRoot;
  target: Readonly<{
    systemName: string;
    accountId: IAccountId;
    accountName: string;
    actorId: IActorId;
    actorName: string;
    frontendName: string;
    frontendVersion: string;
  }>;
  frontendSpec: IFrontendControllerSpec;
  frontendSpecHash: string;
  network: IAccountFrontendReplicaNetwork | null;
  stateAcquisitionNetwork: IAccountFrontendReplicaNetwork | null;
  ticketAcquisitionNetwork: IAccountFrontendReplicaNetwork | null;
  provider: AccountFrontendReplicaProviderApi;
  acquiredApi: IAcquiredAccountFrontendReplicaApi;
  authority: 'online' | 'cached-offline';
  role: 'active' | 'commissioned';
  hasActiveOwner: boolean;
  commissionOwnerIds: Set<string>;
  sessions: Map<ISessionId, IAccountSessionRegistration>;
  isReleased: boolean;
  isUpdateRequired: boolean;
  transportRegain: (() => Promise<'update-required' | void>) | null;
  transportRegainOperation: Promise<void> | null;
  removeTransportRegainListener: (() => void) | null;
};

type IServiceReplicaEntry = {
  key: string;
  root: IWorkerRoot;
  target: Readonly<{
    systemName: string;
    serviceName: string;
    actorId: IActorId;
    actorName: string;
    frontendName: string;
    frontendVersion: string;
  }>;
  frontendSpec: ReturnType<typeof makeServiceFrontendControllerSpec>;
  frontendSpecHash: string;
  network: IServiceFrontendReplicaNetwork | null;
  stateAcquisitionNetwork: IServiceFrontendReplicaNetwork | null;
  ticketAcquisitionNetwork: IServiceFrontendReplicaNetwork | null;
  provider: ServiceFrontendReplicaProviderApi;
  acquiredApi: IAcquiredServiceFrontendReplicaApi;
  authority: 'online' | 'cached-offline';
  role: 'active' | 'commissioned';
  hasActiveOwner: boolean;
  commissionOwnerIds: Set<string>;
  sessions: Map<ISessionId, IServiceSessionRegistration>;
  isReleased: boolean;
  isUpdateRequired: boolean;
  transportRegain: (() => Promise<'update-required' | void>) | null;
  transportRegainOperation: Promise<void> | null;
  removeTransportRegainListener: (() => void) | null;
};

export type IAccountFrontendReplicaAcquisition = Readonly<{
  hydrateSession(props: {
    sessionId: ISessionId;
    handleFrontendReplicaBlock(
      frontendReplicaBlock: IFrontendReplicaBlock,
    ): Promise<void>;
    replaceFrontendState(
      frontendReplicaState: IFrontendReplicaState,
    ): Promise<void>;
    setDatabaseName(databaseName: string): void;
    setOnline(): void;
    setRepairing(): void;
    setUpdateRequired(): void;
    setFailure(error: unknown): void;
    teardown(error: IAnyError | null): Promise<void>;
  }): Effect.Effect<
    Readonly<{
      frontendReplicaState: IFrontendReplicaState;
      databaseName: string;
      release: Effect.Effect<void>;
    }>,
    IAnyError
  >;
  releaseCommissionOwner: Effect.Effect<void, IAnyError>;
}>;

export type IServiceFrontendReplicaAcquisition = Readonly<{
  hydrateSession(props: {
    sessionId: ISessionId;
    handleServiceFrontendReplicaBlock(
      serviceFrontendReplicaBlock: IServiceFrontendReplicaBlock,
    ): Promise<void>;
    replaceFrontendState(
      serviceFrontendReplicaState: IServiceFrontendReplicaState,
    ): Promise<void>;
    setDatabaseName(databaseName: string): void;
    setOnline(): void;
    setRepairing(): void;
    setUpdateRequired(): void;
    setFailure(error: unknown): void;
    teardown(error: IAnyError | null): Promise<void>;
  }): Effect.Effect<
    Readonly<{
      serviceFrontendReplicaState: IServiceFrontendReplicaState;
      databaseName: string;
      release: Effect.Effect<void>;
    }>,
    IAnyError
  >;
  releaseCommissionOwner: Effect.Effect<void, IAnyError>;
}>;

const CachedAccountFrontendLocatorSchema = Schema.Struct({
  kind: Schema.Literal('account'),
  role: Schema.Literal('active', 'commissioned'),
  systemName: Schema.String,
  accountName: Schema.String,
  accountId: makeAbbreviationIdSchema(coreAbbreviations.account),
  actorName: Schema.String,
  actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
  frontendName: Schema.String,
  frontendVersion: Schema.String,
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  generationId: Schema.String,
  systemVersion: Schema.String,
  systemWorkerName: Schema.String,
  authenticatedAt: Schema.Number,
  expiresAt: Schema.Number,
});

const CachedServiceFrontendLocatorSchema = Schema.Struct({
  kind: Schema.Literal('service'),
  role: Schema.Literal('active', 'commissioned'),
  systemName: Schema.String,
  serviceName: Schema.String,
  actorName: Schema.String,
  actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
  frontendName: Schema.String,
  frontendVersion: Schema.String,
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  generationId: Schema.String,
  systemVersion: Schema.String,
  systemWorkerName: Schema.String,
  authenticatedAt: Schema.Number,
  expiresAt: Schema.Number,
});

const CachedFrontendLocatorSchema = Schema.Union(
  CachedAccountFrontendLocatorSchema,
  CachedServiceFrontendLocatorSchema,
);

export type ICachedAccountFrontendLocator = Schema.Schema.Type<
  typeof CachedAccountFrontendLocatorSchema
>;

export type ICachedServiceFrontendLocator = Schema.Schema.Type<
  typeof CachedServiceFrontendLocatorSchema
>;

type IFrontendLocatorStoreState = {
  locators: Record<
    string,
    Schema.Schema.Type<typeof CachedFrontendLocatorSchema>
  >;
};

const FrontendLocatorStorageValueSchema = Schema.Struct({
  state: Schema.Struct({
    locators: Schema.Record({
      key: Schema.String,
      value: CachedFrontendLocatorSchema,
    }),
  }),
  version: Schema.optional(Schema.Number),
});

const locatorTtlMilliseconds = 24 * 60 * 60 * 1_000;
let nextBrowserPartitionControllerId = 0;

export interface IBrowserPartitionController {
  partitionKey: string;
  isSharedWorkerEnabled: boolean;
  store: StoreApi<{
    partitionKey: string;
    workerRootCount: number;
  }>;
  getAccountGenerateSignature(frontend: IFrontendController): ISignatureFactory;
  getServiceGenerateSignature(
    frontend: IServiceFrontendController,
  ): ISignatureFactory;
  getCachedAccountFrontendLocator(props: {
    apiUrl: string;
    publishableKey: string;
    frontend: IFrontendController;
    role: 'active' | 'commissioned';
  }): ICachedAccountFrontendLocator | null;
  getCachedServiceFrontendLocator(props: {
    apiUrl: string;
    publishableKey: string;
    frontend: IServiceFrontendController;
    role: 'active' | 'commissioned';
  }): ICachedServiceFrontendLocator | null;
  setCachedAccountFrontendLocator(props: {
    apiUrl: string;
    publishableKey: string;
    frontend: IFrontendController;
    role: 'active' | 'commissioned';
    identity: Omit<
      ICachedAccountFrontendLocator,
      'kind' | 'role' | 'authenticatedAt' | 'expiresAt'
    >;
  }): void;
  setCachedServiceFrontendLocator(props: {
    apiUrl: string;
    publishableKey: string;
    frontend: IServiceFrontendController;
    role: 'active' | 'commissioned';
    identity: Omit<
      ICachedServiceFrontendLocator,
      'kind' | 'role' | 'authenticatedAt' | 'expiresAt'
    >;
  }): void;
  invalidateCachedAccountFrontendLocators(props: {
    apiUrl: string;
    publishableKey: string;
    error?: unknown;
    frontend: Pick<
      IFrontendController,
      'systemName' | 'accountName' | 'actorName' | 'frontendName'
    >;
  }): Effect.Effect<void>;
  invalidateCachedServiceFrontendLocators(props: {
    apiUrl: string;
    publishableKey: string;
    error?: unknown;
    frontend: Pick<
      IServiceFrontendController,
      'systemName' | 'serviceName' | 'actorName' | 'frontendName'
    >;
  }): Effect.Effect<void>;
  acquireAccountFrontendReplica(props: {
    frontend: IFrontendController;
    apiUrl: string;
    publishableKey: string;
    systemId: ISystemId;
    generationId: string;
    systemVersion: string;
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
    commissionOwnerId: string | null;
    network: IAccountFrontendReplicaNetwork | null;
    transportRegain: (() => Promise<'update-required' | void>) | null;
  }): Effect.Effect<IAccountFrontendReplicaAcquisition, IAnyError, CuidFactory>;
  stageAccountFrontendCommand(props: {
    sessionId: ISessionId;
    baseReplicaIndex: number;
    command: IEncodedCommand<IStagedCommand>;
    mutations: readonly IEncodedFrontendMutation[];
  }): Effect.Effect<void, IAnyError>;
  acquireServiceFrontendReplica(props: {
    frontend: IServiceFrontendController;
    apiUrl: string;
    publishableKey: string;
    systemId: ISystemId;
    generationId: string;
    systemVersion: string;
    serviceName: string;
    actorId: IActorId;
    actorName: string;
    frontendName: string;
    frontendVersion: string;
    frontendSpec: ReturnType<typeof makeServiceFrontendControllerSpec>;
    frontendSpecHash: string;
    authority: 'online' | 'cached-offline';
    role: 'active' | 'commissioned';
    commissionOwnerId: string | null;
    network: IServiceFrontendReplicaNetwork | null;
    transportRegain: (() => Promise<'update-required' | void>) | null;
  }): Effect.Effect<IServiceFrontendReplicaAcquisition, IAnyError>;
  release(): Promise<void>;
}

export function makeBrowserPartitionController(
  partitionKey: string,
  isSharedWorkerEnabled?: boolean,
): IBrowserPartitionController;
export function makeBrowserPartitionController(props: {
  partitionKey: string;
  isSharedWorkerEnabled?: boolean;
  getFrontendAuthenticator(
    frontendName: string,
  ): IFrontendAuthenticator | undefined;
}): IBrowserPartitionController;
export function makeBrowserPartitionController(
  props:
    | string
    | {
        partitionKey: string;
        isSharedWorkerEnabled?: boolean;
        getFrontendAuthenticator(
          frontendName: string,
        ): IFrontendAuthenticator | undefined;
      },
  legacyIsSharedWorkerEnabled = false,
): IBrowserPartitionController {
  const partitionKey = typeof props === 'string' ? props : props.partitionKey;
  const isSharedWorkerEnabled =
    typeof props === 'string'
      ? legacyIsSharedWorkerEnabled
      : (props.isSharedWorkerEnabled ?? false);
  const getFrontendAuthenticator =
    typeof props === 'string'
      ? (_frontendName: string): IFrontendAuthenticator | undefined => undefined
      : props.getFrontendAuthenticator;
  nextBrowserPartitionControllerId += 1;
  const browserPartitionControllerId = nextBrowserPartitionControllerId;

  const store = createStore<{
    partitionKey: string;
    workerRootCount: number;
  }>(() => ({
    partitionKey,
    workerRootCount: 0,
  }));

  const locatorStorage: PersistStorage<IFrontendLocatorStoreState> = {
    getItem: name => {
      if (typeof globalThis.localStorage === 'undefined') {
        return null;
      }
      const raw = globalThis.localStorage.getItem(name);
      if (raw === null) {
        return null;
      }
      const decoded = Schema.decodeUnknownEither(
        Schema.parseJson(FrontendLocatorStorageValueSchema),
      )(raw, { onExcessProperty: 'error' });
      if (Either.isLeft(decoded)) {
        globalThis.localStorage.removeItem(name);
        return null;
      }
      if (decoded.right.version === undefined) {
        return { state: decoded.right.state };
      }
      return {
        state: decoded.right.state,
        version: decoded.right.version,
      };
    },
    setItem: (name, value) => {
      if (typeof globalThis.localStorage === 'undefined') {
        return;
      }
      const encoded = Schema.encodeSync(
        Schema.parseJson(FrontendLocatorStorageValueSchema),
      )(value, { onExcessProperty: 'error' });
      globalThis.localStorage.setItem(name, encoded);
    },
    removeItem: name => {
      if (typeof globalThis.localStorage !== 'undefined') {
        globalThis.localStorage.removeItem(name);
      }
    },
  };

  const locatorStore = createStore<IFrontendLocatorStoreState>()(
    persist(
      () => ({
        locators: {},
      }),
      {
        name: `zerospin:frontend-locators:${partitionKey}`,
        storage: locatorStorage,
      },
    ),
  );

  const workerRoots = new Map<string, Promise<IWorkerRoot>>();
  const openedWorkerRoots = new Map<string, IWorkerRoot>();
  const workerRootReleases = new Map<string, Effect.Effect<void>>();
  const accountEntries = new Map<string, IAccountReplicaEntry>();
  const serviceEntries = new Map<string, IServiceReplicaEntry>();
  const accountAcquisitionOperations = new Map<string, Promise<void>>();
  const serviceAcquisitionOperations = new Map<string, Promise<void>>();
  let isReleased = false;

  const getWorkerRoot = (rootProps: {
    apiUrl: string;
    publishableKey: string;
    systemId: ISystemId;
    generationId: string;
  }): Effect.Effect<IWorkerRoot, IAnyError> =>
    Effect.tryPromise({
      try: async () => {
        if (isReleased) {
          throw new ZerospinError({
            code: 'browser-partition-controller-released',
            message: 'Browser partition controller has already been released',
          });
        }
        const rootKey = `${rootProps.apiUrl}/${rootProps.publishableKey}/${rootProps.systemId}/${rootProps.generationId}`;
        const existingRoot = workerRoots.get(rootKey);
        if (existingRoot !== undefined) {
          return existingRoot;
        }
        const rootPromise = Effect.runPromise(
          makeSharedWorkerSession({
            apiUrl: rootProps.apiUrl,
            publishableKey: rootProps.publishableKey,
            systemId: rootProps.systemId,
            generationId: rootProps.generationId,
          }),
        )
          .then(async sharedWorkerSession => {
            workerRootReleases.set(rootKey, sharedWorkerSession.release);
            if (isReleased) {
              if (
                workerRootReleases.get(rootKey) === sharedWorkerSession.release
              ) {
                workerRootReleases.delete(rootKey);
                await Effect.runPromise(sharedWorkerSession.release).catch(
                  () => undefined,
                );
              }
              throw new ZerospinError({
                code: 'browser-partition-controller-released',
                message:
                  'Browser partition controller was released while opening its SharedWorker root',
              });
            }
            let partitionApi: PartitionApi;
            try {
              partitionApi = await sharedWorkerSession.api.getPartitionApi({
                partitionKey,
              });
            } catch (error) {
              if (
                workerRootReleases.get(rootKey) === sharedWorkerSession.release
              ) {
                workerRootReleases.delete(rootKey);
                await Effect.runPromise(sharedWorkerSession.release).catch(
                  () => undefined,
                );
              }
              throw error;
            }
            if (isReleased) {
              if (
                workerRootReleases.get(rootKey) === sharedWorkerSession.release
              ) {
                workerRootReleases.delete(rootKey);
                await Effect.runPromise(sharedWorkerSession.release).catch(
                  () => undefined,
                );
              }
              throw new ZerospinError({
                code: 'browser-partition-controller-released',
                message:
                  'Browser partition controller was released while opening its partition root',
              });
            }
            const root = {
              id: `${browserPartitionControllerId}/${rootProps.systemId}/${rootProps.generationId}/${partitionKey}`,
              systemId: rootProps.systemId,
              generationId: rootProps.generationId,
              apiUrl: rootProps.apiUrl,
              publishableKey: rootProps.publishableKey,
              partitionApi,
              release: sharedWorkerSession.release,
            };
            openedWorkerRoots.set(rootKey, root);
            zerospinDevtoolsStore.getState().addSharedWorkerRootDiagnostics({
              id: root.id,
              systemId: root.systemId,
              generationId: root.generationId,
              partitionKey,
              listAccountFrontendReplicas: () =>
                root.partitionApi.listAccountFrontendReplicas(),
              listServiceFrontendReplicas: () =>
                root.partitionApi.listServiceFrontendReplicas(),
            });
            store.setState({ workerRootCount: workerRoots.size });
            return root;
          })
          .catch(async error => {
            const rootRelease = workerRootReleases.get(rootKey);
            workerRootReleases.delete(rootKey);
            openedWorkerRoots.delete(rootKey);
            if (rootRelease !== undefined) {
              await Effect.runPromise(rootRelease).catch(() => undefined);
            }
            workerRoots.delete(rootKey);
            store.setState({ workerRootCount: workerRoots.size });
            throw error;
          });
        workerRoots.set(rootKey, rootPromise);
        store.setState({ workerRootCount: workerRoots.size });
        return rootPromise;
      },
      catch: ZerospinError.catch({
        code: 'failed-to-acquire-shared-worker-root',
        message: 'Failed to acquire Config-owned SharedWorker root',
      }),
    });

  const repairAccountSession = async (
    entry: IAccountReplicaEntry,
    registration: IAccountSessionRegistration,
  ): Promise<
    Readonly<{
      phase:
        | 'failed-before-target-replacement'
        | 'target-replaced-but-failed-catch-up'
        | 'complete';
      systemWorkerName: string | null;
    }>
  > => {
    if (!registration.isRepairing || registration.isReleased) {
      return { phase: 'complete', systemWorkerName: null };
    }
    let didReplaceFrontendState = false;
    let targetSystemWorkerName: string | null = null;
    try {
      const encodedState = await entry.acquiredApi.getFrontendState();
      if (registration.isReleased) {
        return {
          phase: 'failed-before-target-replacement',
          systemWorkerName: null,
        };
      }
      const frontendReplicaState = await Effect.runPromise(
        decodeRpc(encodedState),
      );
      targetSystemWorkerName = frontendReplicaState.systemWorkerName;
      const encodedReplicas =
        await entry.root.partitionApi.listAccountFrontendReplicas();
      const replicas = await Effect.runPromise(decodeRpc(encodedReplicas));
      if (registration.isReleased) {
        return {
          phase: 'failed-before-target-replacement',
          systemWorkerName: targetSystemWorkerName,
        };
      }
      const catalogRow = replicas.find(
        replica =>
          replica.status === 'ready' &&
          replica.role === entry.role &&
          replica.accountId === entry.target.accountId &&
          replica.accountName === entry.target.accountName &&
          replica.actorId === entry.target.actorId &&
          replica.actorName === entry.target.actorName &&
          replica.frontendName === entry.target.frontendName &&
          replica.frontendVersion === entry.target.frontendVersion,
      );
      if (catalogRow === undefined) {
        throw new ZerospinError({
          code: 'account-frontend-replica-catalog-row-missing',
          message:
            'Account frontend replica catalog row disappeared during repair',
        });
      }
      await registration.replaceFrontendState(frontendReplicaState);
      didReplaceFrontendState = true;
      if (registration.isReleased) {
        return {
          phase: 'target-replaced-but-failed-catch-up',
          systemWorkerName: targetSystemWorkerName,
        };
      }
      registration.setDatabaseName(catalogRow.databaseName);
      registration.replicaIndex = frontendReplicaState.replicaIndex;

      while (registration.queuedBlocks.length > 0) {
        const queuedBlocks = registration.queuedBlocks.toSorted(
          (left, right) => left.replicaIndex - right.replicaIndex,
        );
        registration.queuedBlocks = [];
        for (const queuedBlock of queuedBlocks) {
          if (registration.isReleased) {
            return {
              phase: 'target-replaced-but-failed-catch-up',
              systemWorkerName: targetSystemWorkerName,
            };
          }
          if (
            registration.replicaIndex !== null &&
            queuedBlock.replicaIndex <= registration.replicaIndex
          ) {
            continue;
          }
          if (
            registration.replicaIndex === null ||
            queuedBlock.replicaIndex !== registration.replicaIndex + 1
          ) {
            throw new ZerospinError({
              code: 'account-frontend-replica-block-index-gap',
              message:
                'Account frontend replica repair queue contains a non-contiguous block index',
            });
          }
          await registration.handleFrontendReplicaBlock(queuedBlock);
          if (registration.isReleased) {
            return {
              phase: 'target-replaced-but-failed-catch-up',
              systemWorkerName: targetSystemWorkerName,
            };
          }
          registration.replicaIndex = queuedBlock.replicaIndex;
        }
      }
      registration.isRepairing = false;
      return {
        phase: 'complete',
        systemWorkerName: targetSystemWorkerName,
      };
    } catch (error) {
      if (!registration.isReleased) {
        const repairFailure = ZerospinError.isZerospinError(error)
          ? error
          : ZerospinError.catch({
              code: 'account-frontend-session-repair-failed',
              message:
                'Account frontend main-thread session could not converge during repair',
            })(error);
        registration.setFailure(repairFailure);
        registration.isReleased = true;
        registration.isRepairing = false;
        registration.isRepairScheduled = false;
        registration.releaseError = repairFailure;
        registration.queuedBlocks = [];
        entry.sessions.delete(registration.sessionId);
        await registration.teardown(repairFailure).catch(() => undefined);
      }
      return {
        phase: didReplaceFrontendState
          ? 'target-replaced-but-failed-catch-up'
          : 'failed-before-target-replacement',
        systemWorkerName: targetSystemWorkerName,
      };
    }
  };

  const repairServiceSession = async (
    entry: IServiceReplicaEntry,
    registration: IServiceSessionRegistration,
  ): Promise<
    Readonly<{
      phase:
        | 'failed-before-target-replacement'
        | 'target-replaced-but-failed-catch-up'
        | 'complete';
      systemWorkerName: string | null;
    }>
  > => {
    if (!registration.isRepairing || registration.isReleased) {
      return { phase: 'complete', systemWorkerName: null };
    }
    let didReplaceFrontendState = false;
    let targetSystemWorkerName: string | null = null;
    try {
      const encodedState = await entry.acquiredApi.getFrontendState();
      if (registration.isReleased) {
        return {
          phase: 'failed-before-target-replacement',
          systemWorkerName: null,
        };
      }
      const serviceFrontendReplicaState = await Effect.runPromise(
        decodeRpc(encodedState),
      );
      targetSystemWorkerName = serviceFrontendReplicaState.systemWorkerName;
      const encodedReplicas =
        await entry.root.partitionApi.listServiceFrontendReplicas();
      const replicas = await Effect.runPromise(decodeRpc(encodedReplicas));
      if (registration.isReleased) {
        return {
          phase: 'failed-before-target-replacement',
          systemWorkerName: targetSystemWorkerName,
        };
      }
      const catalogRow = replicas.find(
        replica =>
          replica.status === 'ready' &&
          replica.role === entry.role &&
          replica.serviceName === entry.target.serviceName &&
          replica.actorId === entry.target.actorId &&
          replica.actorName === entry.target.actorName &&
          replica.frontendName === entry.target.frontendName &&
          replica.frontendVersion === entry.target.frontendVersion,
      );
      if (catalogRow === undefined) {
        throw new ZerospinError({
          code: 'service-frontend-replica-catalog-row-missing',
          message:
            'Service frontend replica catalog row disappeared during repair',
        });
      }
      await registration.replaceFrontendState(serviceFrontendReplicaState);
      didReplaceFrontendState = true;
      if (registration.isReleased) {
        return {
          phase: 'target-replaced-but-failed-catch-up',
          systemWorkerName: targetSystemWorkerName,
        };
      }
      registration.setDatabaseName(catalogRow.databaseName);
      registration.replicaIndex = serviceFrontendReplicaState.replicaIndex;

      while (registration.queuedBlocks.length > 0) {
        const queuedBlocks = registration.queuedBlocks.toSorted(
          (left, right) => left.replicaIndex - right.replicaIndex,
        );
        registration.queuedBlocks = [];
        for (const queuedBlock of queuedBlocks) {
          if (registration.isReleased) {
            return {
              phase: 'target-replaced-but-failed-catch-up',
              systemWorkerName: targetSystemWorkerName,
            };
          }
          if (
            registration.replicaIndex !== null &&
            queuedBlock.replicaIndex <= registration.replicaIndex
          ) {
            continue;
          }
          if (
            registration.replicaIndex === null ||
            queuedBlock.replicaIndex !== registration.replicaIndex + 1
          ) {
            throw new ZerospinError({
              code: 'service-frontend-replica-block-index-gap',
              message:
                'Service frontend replica repair queue contains a non-contiguous block index',
            });
          }
          await registration.handleServiceFrontendReplicaBlock(queuedBlock);
          if (registration.isReleased) {
            return {
              phase: 'target-replaced-but-failed-catch-up',
              systemWorkerName: targetSystemWorkerName,
            };
          }
          registration.replicaIndex = queuedBlock.replicaIndex;
        }
      }
      registration.isRepairing = false;
      return {
        phase: 'complete',
        systemWorkerName: targetSystemWorkerName,
      };
    } catch (error) {
      if (!registration.isReleased) {
        const repairFailure = ZerospinError.isZerospinError(error)
          ? error
          : ZerospinError.catch({
              code: 'service-frontend-session-repair-failed',
              message:
                'Service frontend main-thread session could not converge during repair',
            })(error);
        registration.setFailure(repairFailure);
        registration.isReleased = true;
        registration.isRepairing = false;
        registration.isRepairScheduled = false;
        registration.releaseError = repairFailure;
        registration.queuedBlocks = [];
        entry.sessions.delete(registration.sessionId);
        await registration.teardown(repairFailure).catch(() => undefined);
      }
      return {
        phase: didReplaceFrontendState
          ? 'target-replaced-but-failed-catch-up'
          : 'failed-before-target-replacement',
        systemWorkerName: targetSystemWorkerName,
      };
    }
  };

  class AccountProvider extends RpcTarget {
    constructor(
      private readonly getEntry: () => IAccountReplicaEntry | null,
      private readonly acquisitionNetwork: IAccountFrontendReplicaNetwork | null,
    ) {
      super();
    }

    async getFrontendState(): ReturnType<
      AccountFrontendReplicaProviderApi['getFrontendState']
    > {
      const entry = this.getEntry();
      const network =
        entry === null
          ? this.acquisitionNetwork
          : (entry.stateAcquisitionNetwork ?? entry.network);
      if (network === null) {
        return Effect.runPromise(
          encodeRpc(
            Effect.fail(
              new ZerospinError({
                code: 'cached-frontend-network-unavailable',
                message:
                  'Cached-offline account replica has no network capability',
              }),
            ),
          ),
        );
      }
      const encodedState = await network.getFrontendState().catch(error =>
        Effect.runPromise(
          encodeRpc(
            Effect.fail(
              ZerospinError.catch({
                code: 'account-frontend-provider-state-transport-failed',
                message:
                  'Account frontend provider could not read state through its current network transport',
              })(error),
            ),
          ),
        ),
      );
      const stateOutcome = await Effect.runPromise(
        decodeRpc(encodedState).pipe(Effect.either),
      );
      if (
        Either.isLeft(stateOutcome) &&
        stateOutcome.left.code === 'frontend-version-changed'
      ) {
        if (entry !== null) {
          entry.isUpdateRequired = true;
          for (const registration of entry.sessions.values()) {
            if (!registration.isReleased) {
              registration.setUpdateRequired();
            }
          }
        }
      }
      if (
        Either.isLeft(stateOutcome) &&
        (String(stateOutcome.left.code).includes('signature-invalid') ||
          String(stateOutcome.left.code).includes('authentication') ||
          String(stateOutcome.left.code).includes('authorization') ||
          String(stateOutcome.left.code).includes('authenticate') ||
          String(stateOutcome.left.code).includes('authorize') ||
          String(stateOutcome.left.code).includes('authenticator') ||
          stateOutcome.left.code === 'frontend-admission-target-mismatch') &&
        entry !== null &&
        !entry.isReleased
      ) {
        void Effect.runPromise(
          controller.invalidateCachedAccountFrontendLocators({
            apiUrl: entry.root.apiUrl,
            publishableKey: entry.root.publishableKey,
            error: stateOutcome.left,
            frontend: {
              systemName: entry.target.systemName,
              accountName: entry.target.accountName,
              actorName: entry.target.actorName,
              frontendName: entry.target.frontendName,
            },
          }),
        ).catch(() => undefined);
      }
      return encodedState;
    }

    async createFrontendWebSocketTicket(): ReturnType<
      AccountFrontendReplicaProviderApi['createFrontendWebSocketTicket']
    > {
      const entry = this.getEntry();
      if (entry === null) {
        return Effect.runPromise(
          encodeRpc(
            Effect.fail(
              new ZerospinError({
                code: 'account-frontend-provider-acquisition-incomplete',
                message:
                  'Account frontend provider cannot mint a ticket before replica acquisition completes',
              }),
            ),
          ),
        );
      }
      // A successor Config capability temporarily services the source socket
      // until that source has committed its exact lineage control. Ownership
      // remains with the successor entry; the source only borrows transport.
      const network =
        entry.ticketAcquisitionNetwork ??
        entry.stateAcquisitionNetwork ??
        entry.network;
      if (network === null) {
        return Effect.runPromise(
          encodeRpc(
            Effect.fail(
              new ZerospinError({
                code: 'cached-frontend-network-unavailable',
                message: 'Cached-offline account replica cannot mint a ticket',
              }),
            ),
          ),
        );
      }
      const encodedTicket = await network
        .createFrontendWebSocketTicket()
        .catch(error =>
          Effect.runPromise(
            encodeRpc(
              Effect.fail(
                ZerospinError.catch({
                  code: 'account-frontend-provider-ticket-transport-failed',
                  message:
                    'Account frontend provider could not mint a ticket through its current network transport',
                })(error),
              ),
            ),
          ),
        );
      const ticketOutcome = await Effect.runPromise(
        decodeRpc(encodedTicket).pipe(Effect.either),
      );
      if (
        Either.isRight(ticketOutcome) &&
        ticketOutcome.right.systemId === entry.root.systemId &&
        ticketOutcome.right.generationId === entry.root.generationId &&
        ticketOutcome.right.accountId === entry.target.accountId &&
        ticketOutcome.right.accountName === entry.target.accountName &&
        ticketOutcome.right.actorId === entry.target.actorId &&
        ticketOutcome.right.actorName === entry.target.actorName &&
        ticketOutcome.right.frontendName === entry.target.frontendName &&
        ticketOutcome.right.frontendVersion !== entry.target.frontendVersion
      ) {
        entry.isUpdateRequired = true;
        for (const registration of entry.sessions.values()) {
          if (!registration.isReleased) {
            registration.setUpdateRequired();
          }
        }
      }
      if (
        Either.isLeft(ticketOutcome) &&
        (String(ticketOutcome.left.code).includes('signature-invalid') ||
          String(ticketOutcome.left.code).includes('authentication') ||
          String(ticketOutcome.left.code).includes('authorization') ||
          String(ticketOutcome.left.code).includes('authenticate') ||
          String(ticketOutcome.left.code).includes('authorize') ||
          String(ticketOutcome.left.code).includes('authenticator') ||
          ticketOutcome.left.code === 'frontend-admission-target-mismatch') &&
        !entry.isReleased
      ) {
        void Effect.runPromise(
          controller.invalidateCachedAccountFrontendLocators({
            apiUrl: entry.root.apiUrl,
            publishableKey: entry.root.publishableKey,
            error: ticketOutcome.left,
            frontend: {
              systemName: entry.target.systemName,
              accountName: entry.target.accountName,
              actorName: entry.target.actorName,
              frontendName: entry.target.frontendName,
            },
          }),
        ).catch(() => undefined);
      }
      return encodedTicket;
    }

    async pushCommands(
      commands: readonly IEncodedCommand<IStagedCommand>[],
    ): Promise<
      Schema.EitherEncoded<
        Readonly<{
          pendingCommands: readonly IEncodedCommand<IPushedCommand>[];
          pushedCommands: readonly IEncodedCommand<IPushedCommand>[];
          failedCommands: readonly IEncodedCommand<IFailedStagedCommand>[];
        }>,
        IAnyErrorJson
      >
    > {
      const entry = this.getEntry();
      if (entry === null) {
        return Effect.runPromise(
          encodeRpc(
            Effect.fail(
              new ZerospinError({
                code: 'account-frontend-provider-acquisition-incomplete',
                message:
                  'Account frontend provider cannot push commands before replica acquisition completes',
              }),
            ),
          ),
        );
      }
      // A source journal remains source-owned until migration commits. The
      // successor capability may mint its transition ticket, but it must never
      // push source-generation commands across the target transport.
      const network = entry.network;
      if (network === null) {
        return Effect.runPromise(
          encodeRpc(
            Effect.fail(
              new ZerospinError({
                code: 'cached-frontend-network-unavailable',
                message: 'Cached-offline account replica cannot push commands',
              }),
            ),
          ),
        );
      }
      const encodedPush = await network.pushCommands(commands).catch(error =>
        Effect.runPromise(
          encodeRpc(
            Effect.fail(
              ZerospinError.catch({
                code: 'account-frontend-provider-push-transport-failed',
                message:
                  'Account frontend provider could not push commands through its current network transport',
              })(error),
            ),
          ),
        ),
      );
      const pushOutcome = await Effect.runPromise(
        decodeRpc(encodedPush).pipe(Effect.either),
      );
      if (
        Either.isLeft(pushOutcome) &&
        pushOutcome.left.code === 'frontend-version-changed'
      ) {
        entry.isUpdateRequired = true;
        for (const registration of entry.sessions.values()) {
          if (!registration.isReleased) {
            registration.setUpdateRequired();
          }
        }
      }
      if (
        Either.isLeft(pushOutcome) &&
        (String(pushOutcome.left.code).includes('signature-invalid') ||
          String(pushOutcome.left.code).includes('authentication') ||
          String(pushOutcome.left.code).includes('authorization') ||
          String(pushOutcome.left.code).includes('authenticate') ||
          String(pushOutcome.left.code).includes('authorize') ||
          String(pushOutcome.left.code).includes('authenticator') ||
          pushOutcome.left.code === 'frontend-admission-target-mismatch') &&
        !entry.isReleased
      ) {
        void Effect.runPromise(
          controller.invalidateCachedAccountFrontendLocators({
            apiUrl: entry.root.apiUrl,
            publishableKey: entry.root.publishableKey,
            error: pushOutcome.left,
            frontend: {
              systemName: entry.target.systemName,
              accountName: entry.target.accountName,
              actorName: entry.target.actorName,
              frontendName: entry.target.frontendName,
            },
          }),
        ).catch(() => undefined);
      }
      return encodedPush;
    }

    async handleFrontendReplicaBlock(
      frontendReplicaBlock: IFrontendReplicaBlock,
    ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
      const entry = this.getEntry();
      if (entry === null) {
        return Effect.runPromise(
          encodeRpc(
            Effect.fail(
              new ZerospinError({
                code: 'account-frontend-provider-acquisition-incomplete',
                message:
                  'Account frontend provider cannot receive blocks before replica acquisition completes',
              }),
            ),
          ),
        );
      }
      for (const registration of entry.sessions.values()) {
        if (registration.isReleased) {
          continue;
        }
        if (!registration.isHydrated || registration.isRepairing) {
          registration.queuedBlocks.push(frontendReplicaBlock);
          continue;
        }
        registration.operation = registration.operation.then(async () => {
          if (registration.isReleased) {
            return;
          }
          try {
            await registration.handleFrontendReplicaBlock(frontendReplicaBlock);
            if (registration.isReleased) {
              return;
            }
            registration.replicaIndex = frontendReplicaBlock.replicaIndex;
          } catch {
            if (registration.isReleased) {
              return;
            }
            registration.isRepairing = true;
            registration.queuedBlocks.push(frontendReplicaBlock);
            registration.setRepairing();
          }
        });
        await registration.operation;
        if (
          registration.isRepairing &&
          !registration.isRepairScheduled &&
          !registration.isReleased
        ) {
          registration.isRepairScheduled = true;
          setTimeout(() => {
            if (!registration.isReleased && registration.isRepairing) {
              registration.operation = registration.operation
                .then(async () => {
                  await repairAccountSession(entry, registration);
                })
                .finally(() => {
                  registration.isRepairScheduled = false;
                });
            } else {
              registration.isRepairScheduled = false;
            }
          }, 0);
        }
      }
      return encodeRight(undefined);
    }

    async replaceFrontendState(
      frontendReplicaState: IFrontendReplicaState,
    ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
      const entry = this.getEntry();
      if (entry === null) {
        return Effect.runPromise(
          encodeRpc(
            Effect.fail(
              new ZerospinError({
                code: 'account-frontend-provider-acquisition-incomplete',
                message:
                  'Account frontend provider cannot replace state before replica acquisition completes',
              }),
            ),
          ),
        );
      }
      for (const registration of entry.sessions.values()) {
        if (registration.isReleased) {
          continue;
        }
        if (!registration.isHydrated || registration.isRepairing) {
          continue;
        }
        registration.operation = registration.operation.then(async () => {
          if (registration.isReleased) {
            return;
          }
          try {
            await registration.replaceFrontendState(frontendReplicaState);
            if (registration.isReleased) {
              return;
            }
            registration.replicaIndex = frontendReplicaState.replicaIndex;
            registration.queuedBlocks = [];
          } catch {
            if (registration.isReleased) {
              return;
            }
            registration.isRepairing = true;
            registration.setRepairing();
          }
        });
        await registration.operation;
        if (
          registration.isRepairing &&
          !registration.isRepairScheduled &&
          !registration.isReleased
        ) {
          registration.isRepairScheduled = true;
          setTimeout(() => {
            if (!registration.isReleased && registration.isRepairing) {
              registration.operation = registration.operation
                .then(async () => {
                  await repairAccountSession(entry, registration);
                })
                .finally(() => {
                  registration.isRepairScheduled = false;
                });
            } else {
              registration.isRepairScheduled = false;
            }
          }, 0);
        }
      }

      try {
        const encodedReplicas =
          await entry.root.partitionApi.listAccountFrontendReplicas();
        const replicas = await Effect.runPromise(decodeRpc(encodedReplicas));
        const catalogRow = replicas.find(
          replica =>
            replica.status === 'ready' &&
            replica.role === entry.role &&
            replica.accountId === entry.target.accountId &&
            replica.accountName === entry.target.accountName &&
            replica.actorId === entry.target.actorId &&
            replica.actorName === entry.target.actorName &&
            replica.frontendName === entry.target.frontendName &&
            replica.frontendVersion === entry.target.frontendVersion,
        );
        if (catalogRow === undefined) {
          throw new ZerospinError({
            code: 'account-frontend-replica-catalog-row-missing',
            message:
              'Account frontend replica catalog row disappeared after replacement',
          });
        }
        for (const registration of entry.sessions.values()) {
          if (!registration.isReleased && registration.isHydrated) {
            registration.setDatabaseName(catalogRow.databaseName);
          }
        }
      } catch (error) {
        for (const registration of entry.sessions.values()) {
          if (!registration.isReleased && registration.isHydrated) {
            registration.setFailure(error);
          }
        }
      }
      return encodeRight(undefined);
    }
  }

  class ServiceProvider extends RpcTarget {
    constructor(
      private readonly getEntry: () => IServiceReplicaEntry | null,
      private readonly acquisitionNetwork: IServiceFrontendReplicaNetwork | null,
    ) {
      super();
    }

    async getFrontendState(): ReturnType<
      ServiceFrontendReplicaProviderApi['getFrontendState']
    > {
      const entry = this.getEntry();
      const network =
        entry === null
          ? this.acquisitionNetwork
          : (entry.stateAcquisitionNetwork ?? entry.network);
      if (network === null) {
        return Effect.runPromise(
          encodeRpc(
            Effect.fail(
              new ZerospinError({
                code: 'cached-service-frontend-network-unavailable',
                message:
                  'Cached-offline service replica has no network capability',
              }),
            ),
          ),
        );
      }
      const encodedState = await network.getFrontendState().catch(error =>
        Effect.runPromise(
          encodeRpc(
            Effect.fail(
              ZerospinError.catch({
                code: 'service-frontend-provider-state-transport-failed',
                message:
                  'Service frontend provider could not read state through its current network transport',
              })(error),
            ),
          ),
        ),
      );
      const stateOutcome = await Effect.runPromise(
        decodeRpc(encodedState).pipe(Effect.either),
      );
      if (
        Either.isLeft(stateOutcome) &&
        stateOutcome.left.code === 'frontend-version-changed'
      ) {
        if (entry !== null) {
          entry.isUpdateRequired = true;
          for (const registration of entry.sessions.values()) {
            if (!registration.isReleased) {
              registration.setUpdateRequired();
            }
          }
        }
      }
      if (
        Either.isLeft(stateOutcome) &&
        (String(stateOutcome.left.code).includes('signature-invalid') ||
          String(stateOutcome.left.code).includes('authentication') ||
          String(stateOutcome.left.code).includes('authorization') ||
          String(stateOutcome.left.code).includes('authenticate') ||
          String(stateOutcome.left.code).includes('authorize') ||
          String(stateOutcome.left.code).includes('authenticator') ||
          stateOutcome.left.code ===
            'service-frontend-admission-target-mismatch') &&
        entry !== null &&
        !entry.isReleased
      ) {
        void Effect.runPromise(
          controller.invalidateCachedServiceFrontendLocators({
            apiUrl: entry.root.apiUrl,
            publishableKey: entry.root.publishableKey,
            error: stateOutcome.left,
            frontend: {
              systemName: entry.target.systemName,
              serviceName: entry.target.serviceName,
              actorName: entry.target.actorName,
              frontendName: entry.target.frontendName,
            },
          }),
        ).catch(() => undefined);
      }
      return encodedState;
    }

    async createFrontendWebSocketTicket(): ReturnType<
      ServiceFrontendReplicaProviderApi['createFrontendWebSocketTicket']
    > {
      const entry = this.getEntry();
      if (entry === null) {
        return Effect.runPromise(
          encodeRpc(
            Effect.fail(
              new ZerospinError({
                code: 'service-frontend-provider-acquisition-incomplete',
                message:
                  'Service frontend provider cannot mint a ticket before replica acquisition completes',
              }),
            ),
          ),
        );
      }
      // A successor Config capability temporarily services the source socket
      // until that source has committed its exact lineage control. Ownership
      // remains with the successor entry; the source only borrows transport.
      const network =
        entry.ticketAcquisitionNetwork ??
        entry.stateAcquisitionNetwork ??
        entry.network;
      if (network === null) {
        return Effect.runPromise(
          encodeRpc(
            Effect.fail(
              new ZerospinError({
                code: 'cached-service-frontend-network-unavailable',
                message: 'Cached-offline service replica cannot mint a ticket',
              }),
            ),
          ),
        );
      }
      const encodedTicket = await network
        .createFrontendWebSocketTicket()
        .catch(error =>
          Effect.runPromise(
            encodeRpc(
              Effect.fail(
                ZerospinError.catch({
                  code: 'service-frontend-provider-ticket-transport-failed',
                  message:
                    'Service frontend provider could not mint a ticket through its current network transport',
                })(error),
              ),
            ),
          ),
        );
      const ticketOutcome = await Effect.runPromise(
        decodeRpc(encodedTicket).pipe(Effect.either),
      );
      if (
        Either.isRight(ticketOutcome) &&
        ticketOutcome.right.systemId === entry.root.systemId &&
        ticketOutcome.right.generationId === entry.root.generationId &&
        ticketOutcome.right.serviceName === entry.target.serviceName &&
        ticketOutcome.right.actorId === entry.target.actorId &&
        ticketOutcome.right.actorName === entry.target.actorName &&
        ticketOutcome.right.frontendName === entry.target.frontendName &&
        ticketOutcome.right.frontendVersion !== entry.target.frontendVersion
      ) {
        entry.isUpdateRequired = true;
        for (const registration of entry.sessions.values()) {
          if (!registration.isReleased) {
            registration.setUpdateRequired();
          }
        }
      }
      if (
        Either.isLeft(ticketOutcome) &&
        (String(ticketOutcome.left.code).includes('signature-invalid') ||
          String(ticketOutcome.left.code).includes('authentication') ||
          String(ticketOutcome.left.code).includes('authorization') ||
          String(ticketOutcome.left.code).includes('authenticate') ||
          String(ticketOutcome.left.code).includes('authorize') ||
          String(ticketOutcome.left.code).includes('authenticator') ||
          ticketOutcome.left.code ===
            'service-frontend-admission-target-mismatch') &&
        !entry.isReleased
      ) {
        void Effect.runPromise(
          controller.invalidateCachedServiceFrontendLocators({
            apiUrl: entry.root.apiUrl,
            publishableKey: entry.root.publishableKey,
            error: ticketOutcome.left,
            frontend: {
              systemName: entry.target.systemName,
              serviceName: entry.target.serviceName,
              actorName: entry.target.actorName,
              frontendName: entry.target.frontendName,
            },
          }),
        ).catch(() => undefined);
      }
      return encodedTicket;
    }

    async handleServiceFrontendReplicaBlock(
      serviceFrontendReplicaBlock: IServiceFrontendReplicaBlock,
    ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
      const entry = this.getEntry();
      if (entry === null) {
        return Effect.runPromise(
          encodeRpc(
            Effect.fail(
              new ZerospinError({
                code: 'service-frontend-provider-acquisition-incomplete',
                message:
                  'Service frontend provider cannot receive blocks before replica acquisition completes',
              }),
            ),
          ),
        );
      }
      for (const registration of entry.sessions.values()) {
        if (registration.isReleased) {
          continue;
        }
        if (!registration.isHydrated || registration.isRepairing) {
          registration.queuedBlocks.push(serviceFrontendReplicaBlock);
          continue;
        }
        registration.operation = registration.operation.then(async () => {
          if (registration.isReleased) {
            return;
          }
          try {
            await registration.handleServiceFrontendReplicaBlock(
              serviceFrontendReplicaBlock,
            );
            if (registration.isReleased) {
              return;
            }
            registration.replicaIndex =
              serviceFrontendReplicaBlock.replicaIndex;
          } catch {
            if (registration.isReleased) {
              return;
            }
            registration.isRepairing = true;
            registration.queuedBlocks.push(serviceFrontendReplicaBlock);
            registration.setRepairing();
          }
        });
        await registration.operation;
        if (
          registration.isRepairing &&
          !registration.isRepairScheduled &&
          !registration.isReleased
        ) {
          registration.isRepairScheduled = true;
          setTimeout(() => {
            if (!registration.isReleased && registration.isRepairing) {
              registration.operation = registration.operation
                .then(async () => {
                  await repairServiceSession(entry, registration);
                })
                .finally(() => {
                  registration.isRepairScheduled = false;
                });
            } else {
              registration.isRepairScheduled = false;
            }
          }, 0);
        }
      }
      return encodeRight(undefined);
    }

    async replaceFrontendState(
      serviceFrontendReplicaState: IServiceFrontendReplicaState,
    ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
      const entry = this.getEntry();
      if (entry === null) {
        return Effect.runPromise(
          encodeRpc(
            Effect.fail(
              new ZerospinError({
                code: 'service-frontend-provider-acquisition-incomplete',
                message:
                  'Service frontend provider cannot replace state before replica acquisition completes',
              }),
            ),
          ),
        );
      }
      for (const registration of entry.sessions.values()) {
        if (registration.isReleased) {
          continue;
        }
        if (!registration.isHydrated || registration.isRepairing) {
          continue;
        }
        registration.operation = registration.operation.then(async () => {
          if (registration.isReleased) {
            return;
          }
          try {
            await registration.replaceFrontendState(
              serviceFrontendReplicaState,
            );
            if (registration.isReleased) {
              return;
            }
            registration.replicaIndex =
              serviceFrontendReplicaState.replicaIndex;
            registration.queuedBlocks = [];
          } catch {
            if (registration.isReleased) {
              return;
            }
            registration.isRepairing = true;
            registration.setRepairing();
          }
        });
        await registration.operation;
        if (
          registration.isRepairing &&
          !registration.isRepairScheduled &&
          !registration.isReleased
        ) {
          registration.isRepairScheduled = true;
          setTimeout(() => {
            if (!registration.isReleased && registration.isRepairing) {
              registration.operation = registration.operation
                .then(async () => {
                  await repairServiceSession(entry, registration);
                })
                .finally(() => {
                  registration.isRepairScheduled = false;
                });
            } else {
              registration.isRepairScheduled = false;
            }
          }, 0);
        }
      }

      try {
        const encodedReplicas =
          await entry.root.partitionApi.listServiceFrontendReplicas();
        const replicas = await Effect.runPromise(decodeRpc(encodedReplicas));
        const catalogRow = replicas.find(
          replica =>
            replica.status === 'ready' &&
            replica.role === entry.role &&
            replica.serviceName === entry.target.serviceName &&
            replica.actorId === entry.target.actorId &&
            replica.actorName === entry.target.actorName &&
            replica.frontendName === entry.target.frontendName &&
            replica.frontendVersion === entry.target.frontendVersion,
        );
        if (catalogRow === undefined) {
          throw new ZerospinError({
            code: 'service-frontend-replica-catalog-row-missing',
            message:
              'Service frontend replica catalog row disappeared after replacement',
          });
        }
        for (const registration of entry.sessions.values()) {
          if (!registration.isReleased && registration.isHydrated) {
            registration.setDatabaseName(catalogRow.databaseName);
          }
        }
      } catch (error) {
        for (const registration of entry.sessions.values()) {
          if (!registration.isReleased && registration.isHydrated) {
            registration.setFailure(error);
          }
        }
      }
      return encodeRight(undefined);
    }
  }

  const controller: IBrowserPartitionController = {
    partitionKey,
    isSharedWorkerEnabled,
    store,
    getAccountGenerateSignature(frontend) {
      const authenticator = getFrontendAuthenticator(frontend.frontendName);
      if (
        authenticator === undefined ||
        authenticator.frontend.kind !== 'account' ||
        authenticator.frontend.frontend !== frontend
      ) {
        throw new Error(
          `ZerospinConfig has no account authenticator for frontend "${frontend.frontendName}".`,
        );
      }
      return authenticator.generateSignature;
    },
    getServiceGenerateSignature(frontend) {
      const authenticator = getFrontendAuthenticator(frontend.frontendName);
      if (
        authenticator === undefined ||
        authenticator.frontend.kind !== 'service' ||
        authenticator.frontend.frontend !== frontend
      ) {
        throw new Error(
          `ZerospinConfig has no service authenticator for frontend "${frontend.frontendName}".`,
        );
      }
      return authenticator.generateSignature;
    },
    getCachedAccountFrontendLocator(cacheProps) {
      const apiOrigin = new URL(cacheProps.apiUrl).origin;
      const cacheKey = [
        apiOrigin,
        cacheProps.publishableKey,
        partitionKey,
        'account',
        cacheProps.frontend.systemName,
        cacheProps.frontend.accountName,
        cacheProps.frontend.actorName,
        cacheProps.frontend.frontendName,
        cacheProps.frontend.version,
        cacheProps.role,
      ].join('|');
      const locator = locatorStore.getState().locators[cacheKey];
      if (
        locator === undefined ||
        locator.kind !== 'account' ||
        locator.role !== cacheProps.role ||
        locator.systemName !== cacheProps.frontend.systemName ||
        locator.accountName !== cacheProps.frontend.accountName ||
        locator.actorName !== cacheProps.frontend.actorName ||
        locator.frontendName !== cacheProps.frontend.frontendName ||
        locator.frontendVersion !== cacheProps.frontend.version ||
        !Number.isFinite(locator.authenticatedAt) ||
        !Number.isFinite(locator.expiresAt) ||
        locator.expiresAt !==
          locator.authenticatedAt + locatorTtlMilliseconds ||
        locator.expiresAt <= Date.now()
      ) {
        if (locator !== undefined) {
          const locators = { ...locatorStore.getState().locators };
          delete locators[cacheKey];
          locatorStore.setState({ locators });
        }
        return null;
      }
      return locator;
    },
    getCachedServiceFrontendLocator(cacheProps) {
      const apiOrigin = new URL(cacheProps.apiUrl).origin;
      const cacheKey = [
        apiOrigin,
        cacheProps.publishableKey,
        partitionKey,
        'service',
        cacheProps.frontend.systemName,
        cacheProps.frontend.serviceName,
        cacheProps.frontend.actorName,
        cacheProps.frontend.frontendName,
        cacheProps.frontend.version,
        cacheProps.role,
      ].join('|');
      const locator = locatorStore.getState().locators[cacheKey];
      if (
        locator === undefined ||
        locator.kind !== 'service' ||
        locator.role !== cacheProps.role ||
        locator.systemName !== cacheProps.frontend.systemName ||
        locator.serviceName !== cacheProps.frontend.serviceName ||
        locator.actorName !== cacheProps.frontend.actorName ||
        locator.frontendName !== cacheProps.frontend.frontendName ||
        locator.frontendVersion !== cacheProps.frontend.version ||
        !Number.isFinite(locator.authenticatedAt) ||
        !Number.isFinite(locator.expiresAt) ||
        locator.expiresAt !==
          locator.authenticatedAt + locatorTtlMilliseconds ||
        locator.expiresAt <= Date.now()
      ) {
        if (locator !== undefined) {
          const locators = { ...locatorStore.getState().locators };
          delete locators[cacheKey];
          locatorStore.setState({ locators });
        }
        return null;
      }
      return locator;
    },
    setCachedAccountFrontendLocator(cacheProps) {
      const apiOrigin = new URL(cacheProps.apiUrl).origin;
      const cacheKey = [
        apiOrigin,
        cacheProps.publishableKey,
        partitionKey,
        'account',
        cacheProps.frontend.systemName,
        cacheProps.frontend.accountName,
        cacheProps.frontend.actorName,
        cacheProps.frontend.frontendName,
        cacheProps.frontend.version,
        cacheProps.role,
      ].join('|');
      const commissionedCacheKey = [
        apiOrigin,
        cacheProps.publishableKey,
        partitionKey,
        'account',
        cacheProps.frontend.systemName,
        cacheProps.frontend.accountName,
        cacheProps.frontend.actorName,
        cacheProps.frontend.frontendName,
        cacheProps.frontend.version,
        'commissioned',
      ].join('|');
      locatorStore.setState(state => {
        const locators = { ...state.locators };
        const commissionedLocator = locators[commissionedCacheKey];
        const preservesCommissionedAuthentication =
          cacheProps.role === 'active' &&
          commissionedLocator !== undefined &&
          commissionedLocator.kind === 'account' &&
          commissionedLocator.role === 'commissioned' &&
          commissionedLocator.systemName === cacheProps.identity.systemName &&
          commissionedLocator.accountName === cacheProps.identity.accountName &&
          commissionedLocator.accountId === cacheProps.identity.accountId &&
          commissionedLocator.actorName === cacheProps.identity.actorName &&
          commissionedLocator.actorId === cacheProps.identity.actorId &&
          commissionedLocator.frontendName ===
            cacheProps.identity.frontendName &&
          commissionedLocator.frontendVersion ===
            cacheProps.identity.frontendVersion &&
          commissionedLocator.systemId === cacheProps.identity.systemId &&
          commissionedLocator.generationId ===
            cacheProps.identity.generationId &&
          commissionedLocator.systemVersion ===
            cacheProps.identity.systemVersion &&
          commissionedLocator.systemWorkerName ===
            cacheProps.identity.systemWorkerName &&
          commissionedLocator.expiresAt > Date.now();
        const authenticatedAt = preservesCommissionedAuthentication
          ? commissionedLocator.authenticatedAt
          : Date.now();
        const expiresAt = preservesCommissionedAuthentication
          ? commissionedLocator.expiresAt
          : authenticatedAt + locatorTtlMilliseconds;
        if (preservesCommissionedAuthentication) {
          delete locators[commissionedCacheKey];
        }
        locators[cacheKey] = {
          kind: 'account',
          role: cacheProps.role,
          ...cacheProps.identity,
          authenticatedAt,
          expiresAt,
        };
        return { locators };
      });
    },
    setCachedServiceFrontendLocator(cacheProps) {
      const apiOrigin = new URL(cacheProps.apiUrl).origin;
      const cacheKey = [
        apiOrigin,
        cacheProps.publishableKey,
        partitionKey,
        'service',
        cacheProps.frontend.systemName,
        cacheProps.frontend.serviceName,
        cacheProps.frontend.actorName,
        cacheProps.frontend.frontendName,
        cacheProps.frontend.version,
        cacheProps.role,
      ].join('|');
      const commissionedCacheKey = [
        apiOrigin,
        cacheProps.publishableKey,
        partitionKey,
        'service',
        cacheProps.frontend.systemName,
        cacheProps.frontend.serviceName,
        cacheProps.frontend.actorName,
        cacheProps.frontend.frontendName,
        cacheProps.frontend.version,
        'commissioned',
      ].join('|');
      locatorStore.setState(state => {
        const locators = { ...state.locators };
        const commissionedLocator = locators[commissionedCacheKey];
        const preservesCommissionedAuthentication =
          cacheProps.role === 'active' &&
          commissionedLocator !== undefined &&
          commissionedLocator.kind === 'service' &&
          commissionedLocator.role === 'commissioned' &&
          commissionedLocator.systemName === cacheProps.identity.systemName &&
          commissionedLocator.serviceName === cacheProps.identity.serviceName &&
          commissionedLocator.actorName === cacheProps.identity.actorName &&
          commissionedLocator.actorId === cacheProps.identity.actorId &&
          commissionedLocator.frontendName ===
            cacheProps.identity.frontendName &&
          commissionedLocator.frontendVersion ===
            cacheProps.identity.frontendVersion &&
          commissionedLocator.systemId === cacheProps.identity.systemId &&
          commissionedLocator.generationId ===
            cacheProps.identity.generationId &&
          commissionedLocator.systemVersion ===
            cacheProps.identity.systemVersion &&
          commissionedLocator.systemWorkerName ===
            cacheProps.identity.systemWorkerName &&
          commissionedLocator.expiresAt > Date.now();
        const authenticatedAt = preservesCommissionedAuthentication
          ? commissionedLocator.authenticatedAt
          : Date.now();
        const expiresAt = preservesCommissionedAuthentication
          ? commissionedLocator.expiresAt
          : authenticatedAt + locatorTtlMilliseconds;
        if (preservesCommissionedAuthentication) {
          delete locators[commissionedCacheKey];
        }
        locators[cacheKey] = {
          kind: 'service',
          role: cacheProps.role,
          ...cacheProps.identity,
          authenticatedAt,
          expiresAt,
        };
        return { locators };
      });
    },
    invalidateCachedAccountFrontendLocators(cacheProps) {
      return Effect.promise(async () => {
        const apiOrigin = new URL(cacheProps.apiUrl).origin;
        const locators = { ...locatorStore.getState().locators };
        for (const [key, locator] of Object.entries(locators)) {
          if (
            key.startsWith(
              `${apiOrigin}|${cacheProps.publishableKey}|${partitionKey}|account|`,
            ) &&
            locator.kind === 'account' &&
            locator.systemName === cacheProps.frontend.systemName &&
            locator.accountName === cacheProps.frontend.accountName &&
            locator.actorName === cacheProps.frontend.actorName &&
            locator.frontendName === cacheProps.frontend.frontendName
          ) {
            delete locators[key];
          }
        }
        locatorStore.setState({ locators });

        const revocationFailure = ZerospinError.isZerospinError(
          cacheProps.error,
        )
          ? cacheProps.error
          : new ZerospinError({
              code: 'account-frontend-authority-revoked',
              message:
                'Account frontend authority was revoked for this Config target',
              cause:
                cacheProps.error === undefined
                  ? null
                  : ZerospinError.prettyUnknownFailure(cacheProps.error),
            });
        for (const [entryKey, entry] of accountEntries) {
          if (
            new URL(entry.root.apiUrl).origin !== apiOrigin ||
            entry.root.publishableKey !== cacheProps.publishableKey ||
            entry.target.systemName !== cacheProps.frontend.systemName ||
            entry.target.accountName !== cacheProps.frontend.accountName ||
            entry.target.actorName !== cacheProps.frontend.actorName ||
            entry.target.frontendName !== cacheProps.frontend.frontendName
          ) {
            continue;
          }

          entry.isReleased = true;
          entry.transportRegain = null;
          try {
            entry.removeTransportRegainListener?.();
          } catch {
            // Authority revocation continues after local listener disposal.
          } finally {
            entry.removeTransportRegainListener = null;
          }
          const transportRegainOperation = entry.transportRegainOperation;
          try {
            entry.network?.releaseFrontendApi?.();
          } catch {
            // The revoked capability is detached locally even if disposal fails.
          } finally {
            entry.network = null;
          }

          for (const registration of entry.sessions.values()) {
            if (!registration.isReleased) {
              registration.isReleased = true;
              registration.releaseError = revocationFailure;
              registration.operation = registration.operation.then(() =>
                registration.teardown(revocationFailure),
              );
            }
            await registration.operation.catch(() => undefined);
          }
          entry.sessions.clear();

          // A provider RPC can discover revocation while the SharedWorker is
          // awaiting that callback. Local authority is fully detached above;
          // schedule worker release without retaining the invalidation Effect
          // so the encoded rejection returns before any callback-to-worker RPC.
          setTimeout(() => {
            void Promise.resolve()
              .then(() => entry.acquiredApi.release())
              .then(encodedRelease =>
                Effect.runPromise(decodeRpc(encodedRelease)),
              )
              .catch(() => undefined)
              .finally(() => {
                if (transportRegainOperation === null) {
                  if (accountEntries.get(entryKey) === entry) {
                    accountEntries.delete(entryKey);
                  }
                  return;
                }
                void transportRegainOperation.finally(() => {
                  if (accountEntries.get(entryKey) === entry) {
                    accountEntries.delete(entryKey);
                  }
                });
              });
          }, 0);
        }
      });
    },
    invalidateCachedServiceFrontendLocators(cacheProps) {
      return Effect.promise(async () => {
        const apiOrigin = new URL(cacheProps.apiUrl).origin;
        const locators = { ...locatorStore.getState().locators };
        for (const [key, locator] of Object.entries(locators)) {
          if (
            key.startsWith(
              `${apiOrigin}|${cacheProps.publishableKey}|${partitionKey}|service|`,
            ) &&
            locator.kind === 'service' &&
            locator.systemName === cacheProps.frontend.systemName &&
            locator.serviceName === cacheProps.frontend.serviceName &&
            locator.actorName === cacheProps.frontend.actorName &&
            locator.frontendName === cacheProps.frontend.frontendName
          ) {
            delete locators[key];
          }
        }
        locatorStore.setState({ locators });

        const revocationFailure = ZerospinError.isZerospinError(
          cacheProps.error,
        )
          ? cacheProps.error
          : new ZerospinError({
              code: 'service-frontend-authority-revoked',
              message:
                'Service frontend authority was revoked for this Config target',
              cause:
                cacheProps.error === undefined
                  ? null
                  : ZerospinError.prettyUnknownFailure(cacheProps.error),
            });
        for (const [entryKey, entry] of serviceEntries) {
          if (
            new URL(entry.root.apiUrl).origin !== apiOrigin ||
            entry.root.publishableKey !== cacheProps.publishableKey ||
            entry.target.systemName !== cacheProps.frontend.systemName ||
            entry.target.serviceName !== cacheProps.frontend.serviceName ||
            entry.target.actorName !== cacheProps.frontend.actorName ||
            entry.target.frontendName !== cacheProps.frontend.frontendName
          ) {
            continue;
          }

          entry.isReleased = true;
          entry.transportRegain = null;
          try {
            entry.removeTransportRegainListener?.();
          } catch {
            // Authority revocation continues after local listener disposal.
          } finally {
            entry.removeTransportRegainListener = null;
          }
          const transportRegainOperation = entry.transportRegainOperation;
          try {
            entry.network?.releaseFrontendApi?.();
          } catch {
            // The revoked capability is detached locally even if disposal fails.
          } finally {
            entry.network = null;
          }

          for (const registration of entry.sessions.values()) {
            if (!registration.isReleased) {
              registration.isReleased = true;
              registration.releaseError = revocationFailure;
              registration.operation = registration.operation.then(() =>
                registration.teardown(revocationFailure),
              );
            }
            await registration.operation.catch(() => undefined);
          }
          entry.sessions.clear();

          // A provider RPC can discover revocation while the SharedWorker is
          // awaiting that callback. Local authority is fully detached above;
          // schedule worker release without retaining the invalidation Effect
          // so the encoded rejection returns before any callback-to-worker RPC.
          setTimeout(() => {
            void Promise.resolve()
              .then(() => entry.acquiredApi.release())
              .then(encodedRelease =>
                Effect.runPromise(decodeRpc(encodedRelease)),
              )
              .catch(() => undefined)
              .finally(() => {
                if (transportRegainOperation === null) {
                  if (serviceEntries.get(entryKey) === entry) {
                    serviceEntries.delete(entryKey);
                  }
                  return;
                }
                void transportRegainOperation.finally(() => {
                  if (serviceEntries.get(entryKey) === entry) {
                    serviceEntries.delete(entryKey);
                  }
                });
              });
          }, 0);
        }
      });
    },
    acquireAccountFrontendReplica: Effect.fn(
      'BrowserPartitionController.acquireAccountFrontendReplica',
    )(function* (acquireProps) {
      const commissionOwnerId = acquireProps.commissionOwnerId;
      const acquisitionOperationKey = [
        acquireProps.apiUrl,
        acquireProps.publishableKey,
        partitionKey,
        'account',
        acquireProps.frontend.systemName,
        acquireProps.accountName,
        acquireProps.actorName,
        acquireProps.frontendName,
      ].join('|');
      const previousAcquisitionOperation =
        accountAcquisitionOperations.get(acquisitionOperationKey) ??
        Promise.resolve();
      const acquisitionOperationBarrier = Promise.withResolvers<void>();
      const acquisitionOperation = previousAcquisitionOperation.then(
        () => acquisitionOperationBarrier.promise,
      );
      accountAcquisitionOperations.set(
        acquisitionOperationKey,
        acquisitionOperation,
      );
      let didAdoptNetwork = acquireProps.network === null;

      return yield* Effect.gen(function* () {
        // One Config operation at a time may replace authority, borrow a
        // successor ticket transport, activate a target, or release its source.
        // The key deliberately spans every generation and frontend version for
        // this authored frontend so those mutations cannot overwrite each
        // other's operation-scoped network slots.
        yield* Effect.promise(() => previousAcquisitionOperation);
      if (!isSharedWorkerEnabled) {
        return yield* new ZerospinError({
          code: 'shared-worker-mode-disabled',
          message:
            'Cannot acquire a worker replica while direct mode is selected',
        });
      }
      if (acquireProps.role === 'commissioned' && commissionOwnerId === null) {
        return yield* new ZerospinError({
          code: 'account-frontend-commission-owner-missing',
          message: 'Commissioned account replica acquisition requires an owner',
        });
      }
      if (
        acquireProps.frontend.accountName !== acquireProps.accountName ||
        acquireProps.frontend.actorName !== acquireProps.actorName ||
        acquireProps.frontend.frontendName !== acquireProps.frontendName ||
        acquireProps.frontend.version !== acquireProps.frontendVersion
      ) {
        return yield* new ZerospinError({
          code: 'account-frontend-compiled-acquisition-target-mismatch',
          message:
            'Compiled account frontend does not match the replica acquisition target',
        });
      }

      const apiOrigin = new URL(acquireProps.apiUrl).origin;
      const cacheKeyPrefix = `${apiOrigin}|${acquireProps.publishableKey}|${partitionKey}|account|`;
      const sourceLocators: ICachedAccountFrontendLocator[] = [];
      const conflictingLocators: ICachedAccountFrontendLocator[] = [];
      if (acquireProps.authority === 'online') {
        const locators = { ...locatorStore.getState().locators };
        let removedInvalidLocator = false;

        for (const [cacheKey, locator] of Object.entries(locators)) {
          if (
            !cacheKey.startsWith(cacheKeyPrefix) ||
            locator.kind !== 'account'
          ) {
            continue;
          }
          if (
            locator.systemName !== acquireProps.frontend.systemName ||
            locator.accountName !== acquireProps.accountName ||
            locator.actorName !== acquireProps.actorName ||
            locator.frontendName !== acquireProps.frontendName
          ) {
            continue;
          }
          if (
            !Number.isFinite(locator.authenticatedAt) ||
            !Number.isFinite(locator.expiresAt) ||
            locator.expiresAt !==
              locator.authenticatedAt + locatorTtlMilliseconds
          ) {
            delete locators[cacheKey];
            removedInvalidLocator = true;
            continue;
          }
          if (
            locator.accountId !== acquireProps.accountId ||
            locator.actorId !== acquireProps.actorId ||
            locator.systemId !== acquireProps.systemId
          ) {
            delete locators[cacheKey];
            removedInvalidLocator = true;
            conflictingLocators.push(locator);
            continue;
          }
          if (
            locator.role !== 'active' ||
            (locator.generationId === acquireProps.generationId &&
              locator.frontendVersion === acquireProps.frontendVersion)
          ) {
            continue;
          }
          if (
            sourceLocators.some(
              existing =>
                existing.generationId === locator.generationId &&
                existing.frontendVersion === locator.frontendVersion,
            )
          ) {
            continue;
          }
          sourceLocators.push(locator);
        }

        if (removedInvalidLocator) {
          locatorStore.setState({ locators });
        }

        // A successful online authentication is authoritative for this static
        // principal/frontend. Detach only conflicting acquisitions for that
        // exact static target; unrelated account and service entries survive.
        for (const conflictingLocator of conflictingLocators) {
          for (const [
            conflictingEntryKey,
            conflictingEntry,
          ] of accountEntries) {
            if (
              conflictingEntry.root.systemId !== conflictingLocator.systemId ||
              conflictingEntry.root.generationId !==
                conflictingLocator.generationId ||
              conflictingEntry.target.accountId !==
                conflictingLocator.accountId ||
              conflictingEntry.target.accountName !==
                conflictingLocator.accountName ||
              conflictingEntry.target.actorId !== conflictingLocator.actorId ||
              conflictingEntry.target.actorName !==
                conflictingLocator.actorName ||
              conflictingEntry.target.frontendName !==
                conflictingLocator.frontendName ||
              conflictingEntry.target.frontendVersion !==
                conflictingLocator.frontendVersion
            ) {
              continue;
            }
            conflictingEntry.isReleased = true;
            conflictingEntry.transportRegain = null;
            try {
              conflictingEntry.removeTransportRegainListener?.();
            } catch {
              // Continue revoking the conflicting account capability.
            } finally {
              conflictingEntry.removeTransportRegainListener = null;
            }
            for (const registration of conflictingEntry.sessions.values()) {
              if (!registration.isReleased) {
                registration.isReleased = true;
                registration.releaseError = new ZerospinError({
                  code: 'account-frontend-authority-replaced',
                  message:
                    'A newer authoritative account identity replaced this frontend acquisition',
                });
                registration.operation = registration.operation.then(() =>
                  registration.teardown(registration.releaseError),
                );
              }
              yield* Effect.promise(() =>
                registration.operation.catch(() => undefined),
              );
            }
            yield* Effect.gen(function* () {
              const encodedRelease = yield* Effect.tryPromise({
                try: () => conflictingEntry.acquiredApi.release(),
                catch: ZerospinError.catch({
                  code: 'conflicting-account-frontend-release-transport-failed',
                  message:
                    'Failed to release a superseded account frontend acquisition',
                }),
              });
              yield* decodeRpc(encodedRelease);
            }).pipe(
              Effect.ensuring(
                Effect.sync(() => {
                  try {
                    conflictingEntry.network?.releaseFrontendApi?.();
                  } catch {
                    // Superseded local capability disposal cannot retain stale
                    // registry ownership after remote revocation completed.
                  } finally {
                    conflictingEntry.network = null;
                    conflictingEntry.sessions.clear();
                    accountEntries.delete(conflictingEntryKey);
                  }
                }),
              ),
              Effect.catchAll(() => Effect.void),
            );
          }
        }
      }

      const root = yield* getWorkerRoot(acquireProps);
      if (acquireProps.authority === 'online') {
        const encodedAccountCatalog = yield* Effect.tryPromise({
          try: () => root.partitionApi.listAccountFrontendReplicas(),
          catch: ZerospinError.catch({
            code: 'account-frontend-replica-catalog-read-failed',
            message:
              'Failed to read recorded predecessor journals from the target catalog',
          }),
        });
        const accountCatalog = yield* decodeRpc(encodedAccountCatalog);
        const targetCatalogRow = accountCatalog.find(
          catalogRow =>
            catalogRow.accountId === acquireProps.accountId &&
            catalogRow.accountName === acquireProps.accountName &&
            catalogRow.actorId === acquireProps.actorId &&
            catalogRow.actorName === acquireProps.actorName &&
            catalogRow.frontendName === acquireProps.frontendName &&
            catalogRow.frontendVersion === acquireProps.frontendVersion &&
            catalogRow.status === 'ready',
        );
        if (targetCatalogRow !== undefined) {
          for (const sourceTarget of targetCatalogRow.sourceTargets) {
            if (
              sourceTarget.accountId !== acquireProps.accountId ||
              sourceTarget.accountName !== acquireProps.accountName ||
              sourceTarget.actorId !== acquireProps.actorId ||
              sourceTarget.actorName !== acquireProps.actorName ||
              sourceTarget.frontendName !== acquireProps.frontendName ||
              (sourceTarget.generationId === acquireProps.generationId &&
                sourceTarget.frontendVersion === acquireProps.frontendVersion) ||
              sourceLocators.some(
                sourceLocator =>
                  sourceLocator.generationId === sourceTarget.generationId &&
                  sourceLocator.frontendVersion === sourceTarget.frontendVersion,
              )
            ) {
              continue;
            }
            sourceLocators.push({
              kind: 'account',
              role: 'active',
              systemName: acquireProps.frontend.systemName,
              accountName: sourceTarget.accountName,
              accountId: sourceTarget.accountId,
              actorName: sourceTarget.actorName,
              actorId: sourceTarget.actorId,
              frontendName: sourceTarget.frontendName,
              frontendVersion: sourceTarget.frontendVersion,
              systemId: acquireProps.systemId,
              generationId: sourceTarget.generationId,
              systemVersion: acquireProps.systemVersion,
              systemWorkerName: '',
              authenticatedAt: 0,
              expiresAt: 0,
            });
          }
        }
      }
      sourceLocators.sort(
        (left, right) => left.authenticatedAt - right.authenticatedAt,
      );
      const requiresActivationHandoff = sourceLocators.length > 0;
      const initialRole = requiresActivationHandoff
        ? 'commissioned'
        : acquireProps.role;
      const entryKey = [
        root.id,
        acquireProps.accountId,
        acquireProps.actorId,
        acquireProps.frontendName,
        acquireProps.frontendVersion,
      ].join('|');
      let entry = accountEntries.get(entryKey);

      if (entry === undefined) {
        let nextEntry: IAccountReplicaEntry | null = null;
        const provider = new AccountProvider(
          () => nextEntry,
          acquireProps.network,
        );
        const encodedAcquiredApi = yield* Effect.tryPromise({
          try: () =>
            root.partitionApi.acquireFrontendReplica({
              accountId: acquireProps.accountId,
              accountName: acquireProps.accountName,
              actorId: acquireProps.actorId,
              actorName: acquireProps.actorName,
              frontendName: acquireProps.frontendName,
              frontendVersion: acquireProps.frontendVersion,
              frontendSpec: acquireProps.frontendSpec,
              frontendSpecHash: acquireProps.frontendSpecHash,
              authority: acquireProps.authority,
              role: initialRole,
              provider,
            }),
          catch: ZerospinError.catch({
            code: 'account-frontend-replica-acquisition-transport-failed',
            message: 'Failed to call SharedWorker account replica acquisition',
          }),
        });
        const acquiredApi = yield* decodeRpc(encodedAcquiredApi);
        if (isReleased || accountEntries.has(entryKey)) {
          yield* Effect.promise(async () => {
            await Promise.resolve()
              .then(() => acquiredApi.release())
              .then(encodedRelease =>
                Effect.runPromise(decodeRpc(encodedRelease)),
              )
              .catch(() => undefined);
          });
          return yield* new ZerospinError({
            code: isReleased
              ? 'browser-partition-controller-released'
              : 'account-frontend-replica-acquisition-superseded',
            message: isReleased
              ? 'Browser partition controller was released during account replica acquisition'
              : 'Another account replica acquisition became current before this one could be inserted',
          });
        }
        nextEntry = {
          key: entryKey,
          root,
          target: {
            systemName: acquireProps.frontend.systemName,
            accountId: acquireProps.accountId,
            accountName: acquireProps.accountName,
            actorId: acquireProps.actorId,
            actorName: acquireProps.actorName,
            frontendName: acquireProps.frontendName,
            frontendVersion: acquireProps.frontendVersion,
          },
          frontendSpec: acquireProps.frontendSpec,
          frontendSpecHash: acquireProps.frontendSpecHash,
          network: acquireProps.network,
          stateAcquisitionNetwork: null,
          ticketAcquisitionNetwork: null,
          provider,
          acquiredApi,
          authority: acquireProps.authority,
          role: initialRole,
          hasActiveOwner: initialRole === 'active',
          commissionOwnerIds:
            commissionOwnerId === null
              ? new Set()
              : new Set([commissionOwnerId]),
          sessions: new Map(),
          isReleased: false,
          isUpdateRequired: false,
          transportRegain: acquireProps.transportRegain,
          transportRegainOperation: null,
          removeTransportRegainListener: null,
        };
        didAdoptNetwork = true;
        entry = nextEntry;
        accountEntries.set(entryKey, entry);
      } else {
        const existingEntry = entry;
        if (existingEntry.network === acquireProps.network) {
          didAdoptNetwork = true;
        }
        if (
          isReleased ||
          existingEntry.isReleased ||
          accountEntries.get(entryKey) !== existingEntry
        ) {
          return yield* new ZerospinError({
            code: 'account-frontend-replica-acquisition-released',
            message:
              'Account replica acquisition was released before it could accept another owner or network',
          });
        }
        const upgradesAuthority =
          existingEntry.authority === 'cached-offline' &&
          acquireProps.authority === 'online';
        const cachedOfflineLocator = upgradesAuthority
          ? controller.getCachedAccountFrontendLocator({
              apiUrl: acquireProps.apiUrl,
              publishableKey: acquireProps.publishableKey,
              frontend: acquireProps.frontend,
              role: 'active',
            })
          : null;
        const upgradesRole =
          existingEntry.role === 'commissioned' && initialRole === 'active';
        if (upgradesAuthority || upgradesRole) {
          if (existingEntry.isReleased) {
            return yield* new ZerospinError({
              code: 'account-frontend-replica-acquisition-released',
              message:
                'Account replica acquisition was released before its authority upgrade',
            });
          }
          const pendingNetwork =
            acquireProps.network !== null &&
            existingEntry.network !== acquireProps.network
              ? acquireProps.network
              : null;
          existingEntry.stateAcquisitionNetwork = pendingNetwork;
          const upgradedApi = yield* Effect.gen(function* () {
            const encodedAcquiredApi = yield* Effect.tryPromise({
              try: () =>
                root.partitionApi.acquireFrontendReplica({
                  accountId: acquireProps.accountId,
                  accountName: acquireProps.accountName,
                  actorId: acquireProps.actorId,
                  actorName: acquireProps.actorName,
                  frontendName: acquireProps.frontendName,
                  frontendVersion: acquireProps.frontendVersion,
                  frontendSpec: acquireProps.frontendSpec,
                  frontendSpecHash: acquireProps.frontendSpecHash,
                  authority: upgradesAuthority
                    ? 'online'
                    : existingEntry.authority,
                  role: upgradesRole ? 'active' : existingEntry.role,
                  provider: existingEntry.provider,
                }),
              catch: ZerospinError.catch({
                code: 'account-frontend-replica-upgrade-transport-failed',
                message:
                  'Failed to upgrade SharedWorker account replica acquisition',
              }),
            });
            return yield* decodeRpc(encodedAcquiredApi);
          }).pipe(
            Effect.tapError(() =>
              Effect.sync(() => {
                if (existingEntry.stateAcquisitionNetwork === pendingNetwork) {
                  existingEntry.stateAcquisitionNetwork = null;
                }
              }),
            ),
          );
          if (
            isReleased ||
            existingEntry.isReleased ||
            accountEntries.get(entryKey) !== existingEntry
          ) {
            if (existingEntry.stateAcquisitionNetwork === pendingNetwork) {
              existingEntry.stateAcquisitionNetwork = null;
            }
            yield* Effect.promise(async () => {
              await Promise.resolve()
                .then(() => upgradedApi.release())
                .then(encodedRelease =>
                  Effect.runPromise(decodeRpc(encodedRelease)),
                )
                .catch(() => undefined);
            });
            return yield* new ZerospinError({
              code: 'account-frontend-replica-upgrade-released',
              message:
                'Account replica acquisition was released while its authority upgrade was in flight',
            });
          }
          if (existingEntry.stateAcquisitionNetwork === pendingNetwork) {
            existingEntry.stateAcquisitionNetwork = null;
          }
          if (
            pendingNetwork !== null &&
            existingEntry.network !== pendingNetwork
          ) {
            const previousNetwork = existingEntry.network;
            existingEntry.network = pendingNetwork;
            didAdoptNetwork = true;
            try {
              previousNetwork?.releaseFrontendApi?.();
            } catch {
              // The new capability is already authoritative for this retained
              // entry. Local disposal cannot roll that ownership transfer back.
            }
          }
          existingEntry.acquiredApi = upgradedApi;
          if (upgradesAuthority) {
            existingEntry.authority = 'online';
            for (const registration of existingEntry.sessions.values()) {
              if (!registration.isReleased) {
                registration.setOnline();
              }
            }
            if (
              cachedOfflineLocator !== null &&
              !isReleased &&
              !existingEntry.isReleased &&
              accountEntries.get(entryKey) === existingEntry
            ) {
              controller.setCachedAccountFrontendLocator({
                apiUrl: acquireProps.apiUrl,
                publishableKey: acquireProps.publishableKey,
                frontend: acquireProps.frontend,
                role: 'active',
                identity: {
                  systemName: acquireProps.frontend.systemName,
                  accountName: acquireProps.accountName,
                  accountId: acquireProps.accountId,
                  actorName: acquireProps.actorName,
                  actorId: acquireProps.actorId,
                  frontendName: acquireProps.frontendName,
                  frontendVersion: acquireProps.frontendVersion,
                  systemId: acquireProps.systemId,
                  generationId: acquireProps.generationId,
                  systemVersion: acquireProps.systemVersion,
                  systemWorkerName: cachedOfflineLocator.systemWorkerName,
                },
              });
            }
          }
          if (upgradesRole) {
            existingEntry.role = 'active';
            existingEntry.hasActiveOwner = true;
          }
        }
        if (commissionOwnerId !== null) {
          existingEntry.commissionOwnerIds.add(commissionOwnerId);
        }
        if (
          existingEntry.transportRegain === null &&
          acquireProps.transportRegain !== null
        ) {
          existingEntry.transportRegain = acquireProps.transportRegain;
        }
        if (
          acquireProps.network !== null &&
          existingEntry.network !== acquireProps.network
        ) {
          const previousNetwork = existingEntry.network;
          existingEntry.network = acquireProps.network;
          didAdoptNetwork = true;
          try {
            previousNetwork?.releaseFrontendApi?.();
          } catch {
            // Keep the newly adopted capability reachable even if disposing
            // the superseded local transport throws.
          }
        }
      }

      const acquiredEntry = accountEntries.get(entryKey);
      if (
        acquiredEntry === undefined ||
        acquiredEntry !== entry ||
        isReleased ||
        acquiredEntry.isReleased
      ) {
        return yield* new ZerospinError({
          code: 'account-frontend-replica-acquisition-missing',
          message:
            'Account replica acquisition disappeared or was released before hydration',
        });
      }

      if (
        requiresActivationHandoff &&
        acquireProps.role === 'commissioned' &&
        commissionOwnerId !== null
      ) {
        yield* Effect.gen(function* () {
          // Commissioning must make source-journal discovery durable before its
          // public promise resolves. The target remains read-only here: an empty
          // import records only the predecessor locator and adapts no commands.
          for (const sourceLocator of sourceLocators) {
            const encodedTargetStateForPredecessor =
              yield* Effect.tryPromise({
                try: () => acquiredEntry.acquiredApi.getFrontendState(),
                catch: ZerospinError.catch({
                  code: 'frontend-command-handoff-target-state-read-failed',
                  message:
                    'Failed to read the commissioned target before recording its predecessor journal',
                }),
              });
            const targetStateForPredecessor = yield* decodeRpc(
              encodedTargetStateForPredecessor,
            );
            const encodedPredecessorRecord = yield* Effect.tryPromise({
              try: () =>
                acquiredEntry.root.partitionApi.importAdaptedFrontendCommands({
                  target: acquiredEntry.target,
                  sourceTarget: {
                    generationId: sourceLocator.generationId,
                    accountId: sourceLocator.accountId,
                    accountName: sourceLocator.accountName,
                    actorId: sourceLocator.actorId,
                    actorName: sourceLocator.actorName,
                    frontendName: sourceLocator.frontendName,
                    frontendVersion: sourceLocator.frontendVersion,
                  },
                  baseReplicaIndex: targetStateForPredecessor.replicaIndex,
                  commands: [],
                }),
              catch: ZerospinError.catch({
                code: 'frontend-command-handoff-predecessor-record-failed',
                message:
                  'Failed to record the exact predecessor journal in the target catalog',
              }),
            });
            yield* decodeRpc(encodedPredecessorRecord);
          }
        }).pipe(
          Effect.tapError(() =>
            Effect.gen(function* () {
              // A failed commission never hands its release Effect to the hook.
              // Remove this exact owner now so a failed catalog write cannot
              // strand the sole SharedWorker registration and network capability.
              const currentEntry = accountEntries.get(entryKey);
              if (currentEntry === undefined) {
                return;
              }
              currentEntry.commissionOwnerIds.delete(commissionOwnerId);
              if (
                currentEntry.hasActiveOwner ||
                currentEntry.commissionOwnerIds.size > 0
              ) {
                return;
              }
              yield* Effect.gen(function* () {
                const encodedRelease = yield* Effect.tryPromise({
                  try: () => currentEntry.acquiredApi.release(),
                  catch: ZerospinError.catch({
                    code: 'account-frontend-commission-release-transport-failed',
                    message:
                      'Failed to release the commissioned account replica owner',
                  }),
                });
                yield* decodeRpc(encodedRelease);
              }).pipe(
                Effect.ensuring(
                  Effect.sync(() => {
                    currentEntry.isReleased = true;
                    currentEntry.transportRegain = null;
                    try {
                      currentEntry.removeTransportRegainListener?.();
                    } catch {
                      // Continue exact-owner teardown after local listener failure.
                    }
                    currentEntry.removeTransportRegainListener = null;
                    try {
                      currentEntry.network?.releaseFrontendApi?.();
                    } catch {
                      // The owner is still removed from local bookkeeping.
                    } finally {
                      currentEntry.network = null;
                      currentEntry.sessions.clear();
                      accountEntries.delete(entryKey);
                    }
                  }),
                ),
              );
            }).pipe(Effect.catchAll(() => Effect.void)),
          ),
        );
      }

      // A transport-regain callback belongs to the compiled frontend version
      // that created it. Carry it to an exact-version successor so later
      // browser online events continue to authenticate the now-current entry.
      // Different-version source Providers deliberately keep their own callback
      // and remain readable in update-required state.
      if (acquiredEntry.transportRegain === null) {
        for (const sourceLocator of sourceLocators) {
          if (
            sourceLocator.frontendVersion !==
            acquiredEntry.target.frontendVersion
          ) {
            continue;
          }
          for (const sourceEntry of accountEntries.values()) {
            if (
              sourceEntry === acquiredEntry ||
              sourceEntry.root.systemId !== sourceLocator.systemId ||
              sourceEntry.root.generationId !== sourceLocator.generationId ||
              sourceEntry.target.accountId !== sourceLocator.accountId ||
              sourceEntry.target.accountName !== sourceLocator.accountName ||
              sourceEntry.target.actorId !== sourceLocator.actorId ||
              sourceEntry.target.actorName !== sourceLocator.actorName ||
              sourceEntry.target.frontendName !== sourceLocator.frontendName ||
              sourceEntry.target.frontendVersion !==
                sourceLocator.frontendVersion ||
              sourceEntry.transportRegain === null
            ) {
              continue;
            }
            acquiredEntry.transportRegain = sourceEntry.transportRegain;
            break;
          }
          if (acquiredEntry.transportRegain !== null) {
            break;
          }
        }
      }

      if (
        acquiredEntry.transportRegain !== null &&
        acquiredEntry.removeTransportRegainListener === null &&
        typeof globalThis.addEventListener === 'function'
      ) {
        const handleTransportRegain = () => {
          if (
            isReleased ||
            acquiredEntry.isReleased ||
            accountEntries.get(entryKey) !== acquiredEntry ||
            acquiredEntry.transportRegain === null ||
            acquiredEntry.transportRegainOperation !== null
          ) {
            return;
          }
          const transportRegain = acquiredEntry.transportRegain;
          const transportRegainOperation = Promise.resolve()
            .then(() => transportRegain())
            .then(outcome => {
              if (
                outcome !== 'update-required' ||
                isReleased ||
                acquiredEntry.isReleased ||
                accountEntries.get(entryKey) !== acquiredEntry
              ) {
                return;
              }
              acquiredEntry.isUpdateRequired = true;
              for (const registration of acquiredEntry.sessions.values()) {
                if (!registration.isReleased) {
                  registration.setUpdateRequired();
                }
              }
            })
            .catch(() => undefined)
            .finally(() => {
              if (
                acquiredEntry.transportRegainOperation ===
                transportRegainOperation
              ) {
                acquiredEntry.transportRegainOperation = null;
              }
            });
          acquiredEntry.transportRegainOperation = transportRegainOperation;
        };
        globalThis.addEventListener('online', handleTransportRegain);
        acquiredEntry.removeTransportRegainListener = () => {
          globalThis.removeEventListener('online', handleTransportRegain);
        };
      }

      if (requiresActivationHandoff && acquireProps.role === 'active') {
        const preparedCommands: Array<
          Readonly<{
            sourceRoot: IWorkerRoot;
            sourceTarget: Readonly<{
              generationId: string;
              accountId: IAccountId;
              accountName: string;
              actorId: IActorId;
              actorName: string;
              frontendName: string;
              frontendVersion: string;
            }>;
            sourceCommand: IEncodedCommand<IStagedCommand>;
            adaptedCommand: IEncodedCommand<IStagedCommand>;
            mutations: readonly IEncodedFrontendMutation[];
          }>
        > = [];

        // Every source is authorized before any target journal byte changes.
        // Same-generation version handoff is accepted only when the worker has
        // byte-equal projection schemas. Cross-generation handoff is accepted
        // only after the source worker has persisted the exact validated
        // lineage transition and applied its boundary.
        for (const sourceLocator of sourceLocators) {
          const sourceRoot = yield* getWorkerRoot({
            apiUrl: acquireProps.apiUrl,
            publishableKey: acquireProps.publishableKey,
            systemId: sourceLocator.systemId,
            generationId: sourceLocator.generationId,
          });
          const sourceTarget = {
            generationId: sourceLocator.generationId,
            accountId: sourceLocator.accountId,
            accountName: sourceLocator.accountName,
            actorId: sourceLocator.actorId,
            actorName: sourceLocator.actorName,
            frontendName: sourceLocator.frontendName,
            frontendVersion: sourceLocator.frontendVersion,
          };
          const target = {
            generationId: acquireProps.generationId,
            ...acquiredEntry.target,
          };
          let borrowedSourceEntry: IAccountReplicaEntry | null = null;
          const borrowedTicketNetwork = acquiredEntry.network;
          for (const sourceEntry of accountEntries.values()) {
            if (
              sourceEntry === acquiredEntry ||
              sourceEntry.root.systemId !== sourceLocator.systemId ||
              sourceEntry.root.generationId !== sourceLocator.generationId ||
              sourceEntry.target.accountId !== sourceLocator.accountId ||
              sourceEntry.target.accountName !== sourceLocator.accountName ||
              sourceEntry.target.actorId !== sourceLocator.actorId ||
              sourceEntry.target.actorName !== sourceLocator.actorName ||
              sourceEntry.target.frontendName !== sourceLocator.frontendName ||
              sourceEntry.target.frontendVersion !==
                sourceLocator.frontendVersion
            ) {
              continue;
            }
            borrowedSourceEntry = sourceEntry;
            break;
          }
          if (borrowedSourceEntry !== null && borrowedTicketNetwork !== null) {
            // The source runtime needs one fresh target-bound ticket to consume
            // its remaining suffix and persist the transition control. It does
            // not own this capability and must stop borrowing it after preflight.
            borrowedSourceEntry.ticketAcquisitionNetwork =
              borrowedTicketNetwork;
          }
          yield* Effect.gen(function* () {
            if (borrowedSourceEntry !== null) {
              // Re-register the already-owned source capability after online
              // authentication. This cancels any long exponential-backoff wait
              // by asking the retained runtime to connect immediately; the
              // provider then mints its one successor ticket through the
              // temporarily borrowed target network.
              const encodedRestartedSourceApi = yield* Effect.tryPromise({
                try: () =>
                  sourceRoot.partitionApi.acquireFrontendReplica({
                    accountId: borrowedSourceEntry.target.accountId,
                    accountName: borrowedSourceEntry.target.accountName,
                    actorId: borrowedSourceEntry.target.actorId,
                    actorName: borrowedSourceEntry.target.actorName,
                    frontendName: borrowedSourceEntry.target.frontendName,
                    frontendVersion: borrowedSourceEntry.target.frontendVersion,
                    frontendSpec: borrowedSourceEntry.frontendSpec,
                    frontendSpecHash: borrowedSourceEntry.frontendSpecHash,
                    authority: 'online',
                    role: borrowedSourceEntry.role,
                    provider: borrowedSourceEntry.provider,
                  }),
                catch: ZerospinError.catch({
                  code: 'source-account-frontend-reconnect-transport-failed',
                  message:
                    'Failed to restart the source account replica with successor transport',
                }),
              });
              borrowedSourceEntry.acquiredApi = yield* decodeRpc(
                encodedRestartedSourceApi,
              );
              borrowedSourceEntry.authority = 'online';
            }
            let lineageIsProven = false;
            while (!lineageIsProven) {
              const attemptedPreflight = yield* Effect.tryPromise({
                try: () =>
                  sourceRoot.partitionApi.markFrontendCommandsMigrated({
                    sourceTarget: {
                      accountId: sourceTarget.accountId,
                      accountName: sourceTarget.accountName,
                      actorId: sourceTarget.actorId,
                      actorName: sourceTarget.actorName,
                      frontendName: sourceTarget.frontendName,
                      frontendVersion: sourceTarget.frontendVersion,
                    },
                    target,
                    commandIds: [],
                  }),
                catch: ZerospinError.catch({
                  code: 'frontend-command-handoff-preflight-transport-failed',
                  message:
                    'Failed to validate the source frontend journal lineage',
                }),
              }).pipe(Effect.flatMap(decodeRpc), Effect.either);
              if (Either.isRight(attemptedPreflight)) {
                lineageIsProven = true;
                continue;
              }
              if (
                attemptedPreflight.left.code !==
                'frontend-journal-migration-lineage-pending'
              ) {
                return yield* attemptedPreflight.left;
              }
              if (borrowedSourceEntry === null) {
                return yield* new ZerospinError({
                  code: 'frontend-command-handoff-source-capability-missing',
                  message:
                    'Source lineage is pending but no exact Config capability can obtain its successor ticket',
                });
              }
              if (
                isReleased ||
                acquiredEntry.isReleased ||
                accountEntries.get(entryKey) !== acquiredEntry ||
                borrowedSourceEntry.isReleased
              ) {
                return yield* new ZerospinError({
                  code: 'account-frontend-replica-activation-released',
                  message:
                    'Account replica acquisition was released while waiting for source lineage',
                });
              }
              yield* Effect.sleep(Duration.millis(50));
            }
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                if (
                  borrowedSourceEntry !== null &&
                  borrowedSourceEntry.ticketAcquisitionNetwork ===
                    borrowedTicketNetwork
                ) {
                  borrowedSourceEntry.ticketAcquisitionNetwork = null;
                }
              }),
            ),
          );

          const encodedDormantCommands = yield* Effect.tryPromise({
            try: () =>
              sourceRoot.partitionApi.getDormantFrontendCommands({
                sourceTarget,
                targetFrontendVersion: acquireProps.frontendVersion,
              }),
            catch: ZerospinError.catch({
              code: 'frontend-dormant-command-read-transport-failed',
              message: 'Failed to read the authorized source command journal',
            }),
          });
          const dormantCommands = yield* decodeRpc(encodedDormantCommands);
          const encodedTargetStateForPredecessor = yield* Effect.tryPromise({
            try: () => acquiredEntry.acquiredApi.getFrontendState(),
            catch: ZerospinError.catch({
              code: 'frontend-command-handoff-target-state-read-failed',
              message:
                'Failed to read the commissioned target before recording its predecessor journal',
            }),
          });
          const targetStateForPredecessor = yield* decodeRpc(
            encodedTargetStateForPredecessor,
          );
          const encodedPredecessorRecord = yield* Effect.tryPromise({
            try: () =>
              acquiredEntry.root.partitionApi.importAdaptedFrontendCommands({
                target: acquiredEntry.target,
                sourceTarget,
                baseReplicaIndex: targetStateForPredecessor.replicaIndex,
                commands: [],
              }),
            catch: ZerospinError.catch({
              code: 'frontend-command-handoff-predecessor-record-failed',
              message:
                'Failed to record the exact predecessor journal in the target catalog',
            }),
          });
          yield* decodeRpc(encodedPredecessorRecord);

          // Historical payload adapters and current contract programs run only
          // in this compiled main-thread runtime. The SharedWorker receives
          // encoded current mutations and never evaluates application code.
          for (const dormant of dormantCommands) {
            const contract =
              acquireProps.frontend.contracts[dormant.command.commandName];
            if (
              contract === undefined ||
              contract.commandName !== dormant.command.commandName
            ) {
              return yield* new ZerospinError({
                code: 'frontend-command-handoff-contract-missing',
                message:
                  'Compiled frontend has no contract for a dormant command',
                extra: {
                  commandId: dormant.command.id,
                  commandName: dormant.command.commandName,
                  sourceVersion: dormant.command.version,
                },
              });
            }

            let payloadInput: unknown;
            if (dormant.command.version === contract.version) {
              payloadInput = yield* contract.decodePayload({
                command: dormant.command,
              });
            } else {
              const historicalDefinition = contract.historicalDefinitions.find(
                definition =>
                  definition.commandName === dormant.command.commandName &&
                  definition.version === dormant.command.version,
              );
              if (historicalDefinition === undefined) {
                return yield* new ZerospinError({
                  code: 'frontend-command-handoff-adapter-missing',
                  message:
                    'Compiled frontend has no direct historical adapter for a dormant command',
                  extra: {
                    commandId: dormant.command.id,
                    commandName: dormant.command.commandName,
                    sourceVersion: dormant.command.version,
                    targetVersion: contract.version,
                  },
                });
              }
              const historicalPayload = yield* Schema.decode(
                Schema.parseJson(
                  makeEffectSchema(historicalDefinition.payload),
                ),
              )(dormant.command.payload, {
                onExcessProperty: 'error',
              }).pipe(
                Effect.mapError(
                  error =>
                    new ZerospinError({
                      code: 'frontend-command-handoff-historical-payload-invalid',
                      message:
                        'Dormant command payload does not match its compiled historical definition',
                      cause: ZerospinError.prettyUnknownFailure(error),
                      extra: {
                        commandId: dormant.command.id,
                        commandName: dormant.command.commandName,
                        sourceVersion: dormant.command.version,
                      },
                    }),
                ),
              );
              payloadInput = yield* historicalDefinition.adaptPayload({
                payload: historicalPayload,
              });
            }

            const currentCommand = {
              ...dormant.command,
              systemVersion: acquireProps.systemVersion,
              version: contract.version,
              payload: payloadInput,
            };
            const current = yield* makeMutations({
              contract,
              models: acquireProps.frontend.models,
              owner: { kind: 'account' },
              command: currentCommand,
            });
            const adaptedCommand = yield* encodeCommand({
              contract,
              command: {
                ...currentCommand,
                payload: current.payload,
              },
            });
            const encodedMutations: IEncodedFrontendMutation[] = [];
            for (const [
              mutationIndex,
              mutation,
            ] of current.mutations.entries()) {
              encodedMutations.push(
                yield* encodeFrontendMutation({
                  commandId: adaptedCommand.id,
                  mutationIndex,
                  mutation,
                }),
              );
            }
            preparedCommands.push({
              sourceRoot,
              sourceTarget,
              sourceCommand: dormant.command,
              adaptedCommand,
              mutations: encodedMutations,
            });
          }
        }

        preparedCommands.sort((left, right) =>
          left.sourceCommand.stagedCursor.localeCompare(
            right.sourceCommand.stagedCursor,
          ),
        );

        // Transfer in original staged-cursor order. Each target transaction is
        // durable before its byte-exact source row is marked migrated.
        for (const prepared of preparedCommands) {
          let imported: Readonly<{
            commandIds: readonly string[];
            replicaIndex: number;
          }> | null = null;
          while (imported === null) {
            const encodedTargetState = yield* Effect.tryPromise({
              try: () => acquiredEntry.acquiredApi.getFrontendState(),
              catch: ZerospinError.catch({
                code: 'frontend-command-handoff-target-state-read-failed',
                message:
                  'Failed to read the commissioned target replica before command import',
              }),
            });
            const targetState = yield* decodeRpc(encodedTargetState);
            const attemptedImport = yield* Effect.tryPromise({
              try: () =>
                acquiredEntry.root.partitionApi.importAdaptedFrontendCommands({
                  target: acquiredEntry.target,
                  sourceTarget: prepared.sourceTarget,
                  baseReplicaIndex: targetState.replicaIndex,
                  commands: [
                    {
                      sourceCommand: prepared.sourceCommand,
                      adaptedCommand: prepared.adaptedCommand,
                      mutations: prepared.mutations,
                    },
                  ],
                }),
              catch: ZerospinError.catch({
                code: 'frontend-command-handoff-import-transport-failed',
                message:
                  'Failed to submit an adapted command to the target journal',
              }),
            }).pipe(Effect.flatMap(decodeRpc), Effect.either);
            if (Either.isLeft(attemptedImport)) {
              if (
                attemptedImport.left.code === 'adapted-command-base-index-stale'
              ) {
                continue;
              }
              return yield* attemptedImport.left;
            }
            imported = attemptedImport.right;
          }

          if (
            imported.commandIds.length !== 1 ||
            imported.commandIds[0] !== prepared.adaptedCommand.id
          ) {
            return yield* new ZerospinError({
              code: 'frontend-command-handoff-import-result-mismatch',
              message:
                'Target journal did not acknowledge the exact adapted command ID',
              extra: {
                expectedCommandId: prepared.adaptedCommand.id,
                actualCommandIds: imported.commandIds,
              },
            });
          }

          const encodedCommittedTargetState = yield* Effect.tryPromise({
            try: () => acquiredEntry.acquiredApi.getFrontendState(),
            catch: ZerospinError.catch({
              code: 'frontend-command-handoff-commit-read-failed',
              message:
                'Failed to observe the committed target command materialization',
            }),
          });
          const committedTargetState = yield* decodeRpc(
            encodedCommittedTargetState,
          );
          if (
            committedTargetState.replicaIndex < imported.replicaIndex ||
            !committedTargetState.stagedCommands.some(
              command => command.id === prepared.adaptedCommand.id,
            )
          ) {
            return yield* new ZerospinError({
              code: 'frontend-command-handoff-target-commit-missing',
              message:
                'Target replica did not expose the committed adapted command before source migration',
              extra: {
                commandId: prepared.adaptedCommand.id,
                committedReplicaIndex: imported.replicaIndex,
                observedReplicaIndex: committedTargetState.replicaIndex,
              },
            });
          }

          const encodedMigration = yield* Effect.tryPromise({
            try: () =>
              prepared.sourceRoot.partitionApi.markFrontendCommandsMigrated({
                sourceTarget: {
                  accountId: prepared.sourceTarget.accountId,
                  accountName: prepared.sourceTarget.accountName,
                  actorId: prepared.sourceTarget.actorId,
                  actorName: prepared.sourceTarget.actorName,
                  frontendName: prepared.sourceTarget.frontendName,
                  frontendVersion: prepared.sourceTarget.frontendVersion,
                },
                target: {
                  generationId: acquireProps.generationId,
                  ...acquiredEntry.target,
                },
                commandIds: imported.commandIds,
              }),
            catch: ZerospinError.catch({
              code: 'frontend-command-handoff-source-marker-transport-failed',
              message:
                'Target command committed but its source migration marker could not be written',
            }),
          });
          yield* decodeRpc(encodedMigration);
        }

        const encodedActivatedApi = yield* Effect.tryPromise({
          try: () =>
            root.partitionApi.acquireFrontendReplica({
              accountId: acquireProps.accountId,
              accountName: acquireProps.accountName,
              actorId: acquireProps.actorId,
              actorName: acquireProps.actorName,
              frontendName: acquireProps.frontendName,
              frontendVersion: acquireProps.frontendVersion,
              frontendSpec: acquireProps.frontendSpec,
              frontendSpecHash: acquireProps.frontendSpecHash,
              authority: acquireProps.authority,
              role: 'active',
              provider: acquiredEntry.provider,
            }),
          catch: ZerospinError.catch({
            code: 'account-frontend-replica-activation-transport-failed',
            message:
              'Dormant commands committed but target replica activation failed',
          }),
        });
        const activatedApi = yield* decodeRpc(encodedActivatedApi);
        if (
          isReleased ||
          acquiredEntry.isReleased ||
          accountEntries.get(entryKey) !== acquiredEntry
        ) {
          yield* Effect.promise(async () => {
            await Promise.resolve()
              .then(() => activatedApi.release())
              .then(encodedRelease =>
                Effect.runPromise(decodeRpc(encodedRelease)),
              )
              .catch(() => undefined);
          });
          return yield* new ZerospinError({
            code: 'account-frontend-replica-activation-released',
            message:
              'Account replica acquisition was released while activation was in flight',
          });
        }
        acquiredEntry.acquiredApi = activatedApi;
        acquiredEntry.role = 'active';
        acquiredEntry.hasActiveOwner = true;
      }

      if (acquireProps.role === 'active') {
        // A mounted Provider does not call hydrateSession again when its own
        // transport-regain callback discovers a successor generation. Move the
        // exact compatible registration object to the activated target and repair
        // that same main-thread database before releasing its source acquisition.
        let didTransferAccountSession = false;
        let transferredAccountSystemWorkerName: string | null = null;
      for (const sourceLocator of sourceLocators) {
        if (
          sourceLocator.frontendVersion !== acquiredEntry.target.frontendVersion
        ) {
          // A mounted controller compiled for another version remains readable,
          // but it must stop staging immediately. Its source capability,
          // database, journal, and locator stay intact for matching code.
          for (const sourceEntry of accountEntries.values()) {
            if (
              sourceEntry === acquiredEntry ||
              sourceEntry.root.systemId !== sourceLocator.systemId ||
              sourceEntry.root.generationId !== sourceLocator.generationId ||
              sourceEntry.target.accountId !== sourceLocator.accountId ||
              sourceEntry.target.accountName !== sourceLocator.accountName ||
              sourceEntry.target.actorId !== sourceLocator.actorId ||
              sourceEntry.target.actorName !== sourceLocator.actorName ||
              sourceEntry.target.frontendName !== sourceLocator.frontendName ||
              sourceEntry.target.frontendVersion !==
                sourceLocator.frontendVersion
            ) {
              continue;
            }
            sourceEntry.isUpdateRequired = true;
            for (const registration of sourceEntry.sessions.values()) {
              if (!registration.isReleased) {
                registration.setUpdateRequired();
              }
            }
          }
          continue;
        }
        for (const sourceEntry of accountEntries.values()) {
          if (
            sourceEntry === acquiredEntry ||
            sourceEntry.root.systemId !== sourceLocator.systemId ||
            sourceEntry.root.generationId !== sourceLocator.generationId ||
            sourceEntry.target.accountId !== sourceLocator.accountId ||
            sourceEntry.target.accountName !== sourceLocator.accountName ||
            sourceEntry.target.actorId !== sourceLocator.actorId ||
            sourceEntry.target.actorName !== sourceLocator.actorName ||
            sourceEntry.target.frontendName !== sourceLocator.frontendName ||
            sourceEntry.target.frontendVersion !== sourceLocator.frontendVersion
          ) {
            continue;
          }

          for (const [sessionId, registration] of sourceEntry.sessions) {
            if (registration.isReleased) {
              continue;
            }

            // Hydration owns the registration until its barrier settles. Wait
            // while it is still source-attached so it cannot finish afterward
            // and overwrite the target locator with the predecessor identity.
            if (!registration.isHydrated) {
              yield* Effect.promise(() =>
                registration.operation.catch(() => undefined),
              );
            }
            if (
              registration.isReleased ||
              !registration.isHydrated ||
              sourceEntry.sessions.get(sessionId) !== registration
            ) {
              continue;
            }

            // A queued source repair must also settle while the registration is
            // still source-owned. Detachment then happens synchronously before
            // the target snapshot operation is installed.
            if (registration.isRepairScheduled) {
              yield* Effect.promise(
                () =>
                  new Promise<void>(resolve => {
                    setTimeout(resolve, 0);
                  }),
              );
            }
            yield* Effect.promise(() =>
              registration.operation.catch(() => undefined),
            );
            registration.isRepairScheduled = false;
            if (
              registration.isReleased ||
              sourceEntry.sessions.get(sessionId) !== registration
            ) {
              continue;
            }

            const sourceReplicaIndex = registration.replicaIndex;
            sourceEntry.sessions.delete(sessionId);
            registration.isRepairing = true;
            registration.queuedBlocks = [];
            registration.setRepairing();
            acquiredEntry.sessions.set(sessionId, registration);
            const targetRepairOperation = registration.operation.then(() =>
              repairAccountSession(acquiredEntry, registration),
            );
            registration.operation = targetRepairOperation.then(
              () => undefined,
            );
            const targetRepair = yield* Effect.promise(
              () => targetRepairOperation,
            );
            if (registration.isReleased) {
              acquiredEntry.sessions.delete(sessionId);
              continue;
            }

            if (
              targetRepair.phase === 'failed-before-target-replacement'
            ) {
              // No target database transaction committed. Reattach to the
              // source and immediately replace from its current snapshot so
              // blocks emitted while detached are not lost.
              acquiredEntry.sessions.delete(sessionId);
              registration.replicaIndex = sourceReplicaIndex;
              registration.isRepairing = true;
              registration.queuedBlocks = [];
              registration.setRepairing();
              sourceEntry.sessions.set(sessionId, registration);
              const sourceRepairOperation = registration.operation.then(() =>
                repairAccountSession(sourceEntry, registration),
              );
              registration.operation = sourceRepairOperation.then(
                () => undefined,
              );
              const sourceRepair = yield* Effect.promise(
                () => sourceRepairOperation,
              );
              if (registration.isReleased) {
                sourceEntry.sessions.delete(sessionId);
                continue;
              }
              sourceEntry.isUpdateRequired = true;
              if (sourceRepair.phase === 'complete') {
                registration.setUpdateRequired();
              } else {
                registration.isRepairing = false;
              }
              continue;
            }

            // Once replaceFrontendState committed, this database is a target
            // database even if queued catch-up or UI metadata application then
            // failed. Never route it back through the source provider.
            registration.isRepairing = false;
            if (targetRepair.phase === 'complete') {
              registration.setOnline();
            }
            didTransferAccountSession = true;
            if (transferredAccountSystemWorkerName === null) {
              transferredAccountSystemWorkerName =
                targetRepair.systemWorkerName;
            }
          }
        }
      }

        if (didTransferAccountSession) {
        if (transferredAccountSystemWorkerName === null) {
          return yield* new ZerospinError({
            code: 'account-frontend-transferred-state-identity-missing',
            message:
              'Target session replacement committed without its worker identity',
          });
        }

        // Publish the target locator before releasing any source capability.
        // The worker identity is the one decoded by the exact repair snapshot;
        // there is no fallible second state read after the database commit.
        controller.setCachedAccountFrontendLocator({
          apiUrl: acquireProps.apiUrl,
          publishableKey: acquireProps.publishableKey,
          frontend: acquireProps.frontend,
          role: 'active',
          identity: {
            systemName: acquireProps.frontend.systemName,
            accountName: acquireProps.accountName,
            accountId: acquireProps.accountId,
            actorName: acquireProps.actorName,
            actorId: acquireProps.actorId,
            frontendName: acquireProps.frontendName,
            frontendVersion: acquireProps.frontendVersion,
            systemId: acquireProps.systemId,
            generationId: acquireProps.generationId,
            systemVersion: acquireProps.systemVersion,
            systemWorkerName: transferredAccountSystemWorkerName,
          },
        });

        for (const sourceLocator of sourceLocators) {
          if (
            sourceLocator.frontendVersion !==
            acquiredEntry.target.frontendVersion
          ) {
            continue;
          }
          for (const [sourceEntryKey, sourceEntry] of accountEntries) {
            if (
              sourceEntry === acquiredEntry ||
              sourceEntry.root.systemId !== sourceLocator.systemId ||
              sourceEntry.root.generationId !== sourceLocator.generationId ||
              sourceEntry.target.accountId !== sourceLocator.accountId ||
              sourceEntry.target.accountName !== sourceLocator.accountName ||
              sourceEntry.target.actorId !== sourceLocator.actorId ||
              sourceEntry.target.actorName !== sourceLocator.actorName ||
              sourceEntry.target.frontendName !== sourceLocator.frontendName ||
              sourceEntry.target.frontendVersion !==
                sourceLocator.frontendVersion ||
              sourceEntry.sessions.size > 0
            ) {
              continue;
            }

            const sourceRelease = yield* Effect.tryPromise({
              try: () => sourceEntry.acquiredApi.release(),
              catch: ZerospinError.catch({
                code: 'source-account-frontend-release-transport-failed',
                message:
                  'Target locator committed but the empty source account acquisition could not be released',
              }),
            }).pipe(Effect.flatMap(decodeRpc), Effect.either);
            if (Either.isLeft(sourceRelease)) {
              continue;
            }
            sourceEntry.isReleased = true;
            sourceEntry.transportRegain = null;
            try {
              sourceEntry.removeTransportRegainListener?.();
            } catch {
              // Target publication is already complete; continue source cleanup.
            } finally {
              sourceEntry.removeTransportRegainListener = null;
            }
            try {
              sourceEntry.network?.releaseFrontendApi?.();
            } catch {
              // Target ownership and locator publication are already durable.
            } finally {
              sourceEntry.network = null;
              accountEntries.delete(sourceEntryKey);
            }
          }
        }
        }
      }

      return {
        hydrateSession: Effect.fn(
          'AccountFrontendReplicaAcquisition.hydrateSession',
        )(function* (hydrateProps) {
          const hydrationBarrier = Promise.withResolvers<void>();
          const registration: IAccountSessionRegistration = {
            ...hydrateProps,
            replicaIndex: null,
            isHydrated: false,
            isRepairing: false,
            isRepairScheduled: false,
            isReleased: false,
            releaseError: null,
            operation: hydrationBarrier.promise.catch(() => undefined),
            queuedBlocks: [],
          };
          acquiredEntry.sessions.set(hydrateProps.sessionId, registration);
          if (acquiredEntry.authority === 'online') {
            registration.setOnline();
          }
          if (acquiredEntry.isUpdateRequired) {
            registration.setUpdateRequired();
          }
          return yield* Effect.gen(function* () {
            const encodedState = yield* Effect.tryPromise({
              try: () => acquiredEntry.acquiredApi.getFrontendState(),
              catch: ZerospinError.catch({
                code: 'account-frontend-replica-state-transport-failed',
                message:
                  'Failed to read the SharedWorker account replica snapshot',
              }),
            });
            const frontendReplicaState = yield* decodeRpc(encodedState);
            if (registration.isReleased) {
              return yield* Effect.fail(
                registration.releaseError ??
                  new ZerospinError({
                    code: 'account-frontend-session-released-during-hydration',
                    message:
                      'Account frontend Provider was released while its worker snapshot was loading',
                  }),
              );
            }
            const encodedReplicas = yield* Effect.tryPromise({
              try: () =>
                acquiredEntry.root.partitionApi.listAccountFrontendReplicas(),
              catch: ZerospinError.catch({
                code: 'account-frontend-replica-catalog-read-failed',
                message:
                  'Failed to read the account replica catalog during hydration',
              }),
            });
            const replicas = yield* decodeRpc(encodedReplicas);
            if (registration.isReleased) {
              return yield* Effect.fail(
                registration.releaseError ??
                  new ZerospinError({
                    code: 'account-frontend-session-released-during-hydration',
                    message:
                      'Account frontend Provider was released while its worker catalog was loading',
                  }),
              );
            }
            const catalogRow = replicas.find(
              replica =>
                replica.status === 'ready' &&
                replica.role === acquiredEntry.role &&
                replica.accountId === acquiredEntry.target.accountId &&
                replica.accountName === acquiredEntry.target.accountName &&
                replica.actorId === acquiredEntry.target.actorId &&
                replica.actorName === acquiredEntry.target.actorName &&
                replica.frontendName === acquiredEntry.target.frontendName &&
                replica.frontendVersion ===
                  acquiredEntry.target.frontendVersion,
            );
            if (catalogRow === undefined) {
              return yield* new ZerospinError({
                code: 'account-frontend-replica-catalog-row-missing',
                message:
                  'Account frontend replica catalog row disappeared during hydration',
              });
            }
            const hydrationOperation = (async () => {
              if (registration.isReleased) {
                throw (
                  registration.releaseError ??
                  new ZerospinError({
                    code: 'account-frontend-session-released-during-hydration',
                    message:
                      'Account frontend Provider was released during hydration',
                  })
                );
              }
              await registration.replaceFrontendState(frontendReplicaState);
              if (registration.isReleased) {
                throw (
                  registration.releaseError ??
                  new ZerospinError({
                    code: 'account-frontend-session-released-during-hydration',
                    message:
                      'Account frontend Provider was released during hydration',
                  })
                );
              }
              registration.setDatabaseName(catalogRow.databaseName);
              registration.replicaIndex = frontendReplicaState.replicaIndex;

              while (registration.queuedBlocks.length > 0) {
                const queuedBlocks = registration.queuedBlocks.toSorted(
                  (left, right) => left.replicaIndex - right.replicaIndex,
                );
                registration.queuedBlocks = [];
                for (const queuedBlock of queuedBlocks) {
                  if (registration.isReleased) {
                    throw (
                      registration.releaseError ??
                      new ZerospinError({
                        code: 'account-frontend-session-released-during-hydration',
                        message:
                          'Account frontend Provider was released during hydration',
                      })
                    );
                  }
                  if (
                    registration.replicaIndex !== null &&
                    queuedBlock.replicaIndex <= registration.replicaIndex
                  ) {
                    continue;
                  }
                  if (
                    registration.replicaIndex === null ||
                    queuedBlock.replicaIndex !== registration.replicaIndex + 1
                  ) {
                    throw new ZerospinError({
                      code: 'account-frontend-replica-catch-up-index-gap',
                      message:
                        'Queued account replica blocks are not contiguous during hydration',
                    });
                  }
                  await registration.handleFrontendReplicaBlock(queuedBlock);
                  registration.replicaIndex = queuedBlock.replicaIndex;
                }
              }
              registration.isHydrated = true;
            })();
            yield* Effect.tryPromise({
              try: () => hydrationOperation,
              catch: error =>
                ZerospinError.isZerospinError(error)
                  ? error
                  : ZerospinError.catch({
                      code: 'account-frontend-replica-hydration-failed',
                      message:
                        'Failed to hydrate the main-thread account database',
                    })(error),
            });

            if (acquireProps.authority === 'online') {
              controller.setCachedAccountFrontendLocator({
                apiUrl: acquireProps.apiUrl,
                publishableKey: acquireProps.publishableKey,
                frontend: acquireProps.frontend,
                role: 'active',
                identity: {
                  systemName: acquireProps.frontend.systemName,
                  accountName: acquireProps.accountName,
                  accountId: acquireProps.accountId,
                  actorName: acquireProps.actorName,
                  actorId: acquireProps.actorId,
                  frontendName: acquireProps.frontendName,
                  frontendVersion: acquireProps.frontendVersion,
                  systemId: acquireProps.systemId,
                  generationId: acquireProps.generationId,
                  systemVersion: acquireProps.systemVersion,
                  systemWorkerName: frontendReplicaState.systemWorkerName,
                },
              });
            }

            // Target journal activation and this Provider's hydration are both
            // complete. Detach only a source registration with this exact
            // session ID. Different-version or sibling Providers keep their
            // readable source database and active locator until they transition
            // or unmount independently.
            for (const sourceLocator of sourceLocators) {
              for (const [sourceEntryKey, sourceEntry] of accountEntries) {
                if (
                  sourceEntry === acquiredEntry ||
                  sourceEntry.root.systemId !== sourceLocator.systemId ||
                  sourceEntry.root.generationId !==
                    sourceLocator.generationId ||
                  sourceEntry.target.accountId !== sourceLocator.accountId ||
                  sourceEntry.target.accountName !==
                    sourceLocator.accountName ||
                  sourceEntry.target.actorId !== sourceLocator.actorId ||
                  sourceEntry.target.actorName !== sourceLocator.actorName ||
                  sourceEntry.target.frontendName !==
                    sourceLocator.frontendName ||
                  sourceEntry.target.frontendVersion !==
                    sourceLocator.frontendVersion
                ) {
                  continue;
                }

                const sourceRegistration = sourceEntry.sessions.get(
                  hydrateProps.sessionId,
                );
                if (sourceRegistration !== undefined) {
                  if (!sourceRegistration.isReleased) {
                    sourceRegistration.isReleased = true;
                    sourceRegistration.operation =
                      sourceRegistration.operation.then(() =>
                        sourceRegistration.teardown(null),
                      );
                  }
                  yield* Effect.promise(() =>
                    sourceRegistration.operation.catch(() => undefined),
                  );
                  sourceEntry.sessions.delete(hydrateProps.sessionId);
                }

                if (sourceEntry.sessions.size > 0) {
                  continue;
                }
                const sourceRelease = yield* Effect.tryPromise({
                  try: () => sourceEntry.acquiredApi.release(),
                  catch: ZerospinError.catch({
                    code: 'source-account-frontend-release-transport-failed',
                    message:
                      'Target hydrated but the source account frontend acquisition could not be released',
                  }),
                }).pipe(Effect.flatMap(decodeRpc), Effect.either);
                if (Either.isLeft(sourceRelease)) {
                  // The target is already committed. Retain the empty source
                  // acquisition so Config teardown can retry capability release.
                  continue;
                }
                sourceEntry.isReleased = true;
                sourceEntry.transportRegain = null;
                try {
                  sourceEntry.removeTransportRegainListener?.();
                } catch {
                  // Target hydration is committed; continue source cleanup.
                } finally {
                  sourceEntry.removeTransportRegainListener = null;
                }
                try {
                  sourceEntry.network?.releaseFrontendApi?.();
                } catch {
                  // The remote source acquisition is already released; local
                  // transport disposal must not undo target hydration.
                }
                sourceEntry.network = null;
                sourceEntry.sessions.clear();
                accountEntries.delete(sourceEntryKey);

                const locators = { ...locatorStore.getState().locators };
                for (const [cacheKey, locator] of Object.entries(locators)) {
                  if (
                    cacheKey.startsWith(cacheKeyPrefix) &&
                    locator.kind === 'account' &&
                    locator.role === 'active' &&
                    locator.systemName === sourceLocator.systemName &&
                    locator.accountName === sourceLocator.accountName &&
                    locator.accountId === sourceLocator.accountId &&
                    locator.actorName === sourceLocator.actorName &&
                    locator.actorId === sourceLocator.actorId &&
                    locator.frontendName === sourceLocator.frontendName &&
                    locator.frontendVersion === sourceLocator.frontendVersion &&
                    locator.systemId === sourceLocator.systemId &&
                    locator.generationId === sourceLocator.generationId
                  ) {
                    delete locators[cacheKey];
                  }
                }
                locatorStore.setState({ locators });
              }
            }

            return {
              frontendReplicaState,
              databaseName: catalogRow.databaseName,
              release: Effect.promise(async () => {
                if (!registration.isReleased) {
                  registration.isReleased = true;
                  registration.operation = registration.operation.then(() =>
                    registration.teardown(null),
                  );
                }
                await registration.operation.catch(() => undefined);
                for (const entry of accountEntries.values()) {
                  if (
                    entry.sessions.get(hydrateProps.sessionId) === registration
                  ) {
                    entry.sessions.delete(hydrateProps.sessionId);
                  }
                }
              }),
            };
          }).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                hydrationBarrier.resolve();
              }),
            ),
            Effect.tapError(error =>
              Effect.sync(() => {
                hydrationBarrier.reject(error);
              }),
            ),
            Effect.tapError(error =>
              Effect.promise(async () => {
                if (!registration.isReleased) {
                  registration.isReleased = true;
                  registration.releaseError = error;
                  registration.operation = registration.operation.then(() =>
                    registration.teardown(error),
                  );
                }
                await registration.operation.catch(() => undefined);
                for (const entry of accountEntries.values()) {
                  if (
                    entry.sessions.get(hydrateProps.sessionId) === registration
                  ) {
                    entry.sessions.delete(hydrateProps.sessionId);
                  }
                }
              }),
            ),
          );
        }),
        releaseCommissionOwner:
          commissionOwnerId === null
            ? Effect.fail(
                new ZerospinError({
                  code: 'account-frontend-commission-owner-missing',
                  message:
                    'This active account replica acquisition has no commission owner to release',
                }),
              )
            : Effect.gen(function* () {
                const currentEntry = accountEntries.get(entryKey);
                if (currentEntry === undefined) {
                  return;
                }
                currentEntry.commissionOwnerIds.delete(commissionOwnerId);
                if (
                  currentEntry.hasActiveOwner ||
                  currentEntry.commissionOwnerIds.size > 0
                ) {
                  return;
                }
                yield* Effect.gen(function* () {
                  const encodedRelease = yield* Effect.tryPromise({
                    try: () => currentEntry.acquiredApi.release(),
                    catch: ZerospinError.catch({
                      code: 'account-frontend-commission-release-transport-failed',
                      message:
                        'Failed to release the commissioned account replica owner',
                    }),
                  });
                  yield* decodeRpc(encodedRelease);
                }).pipe(
                  Effect.ensuring(
                    Effect.sync(() => {
                      currentEntry.isReleased = true;
                      currentEntry.transportRegain = null;
                      try {
                        currentEntry.removeTransportRegainListener?.();
                      } catch {
                        // Continue exact-owner teardown after local listener failure.
                      }
                      currentEntry.removeTransportRegainListener = null;
                      try {
                        currentEntry.network?.releaseFrontendApi?.();
                      } catch {
                        // The owner is still removed from local bookkeeping.
                      } finally {
                        currentEntry.network = null;
                        currentEntry.sessions.clear();
                        accountEntries.delete(entryKey);
                      }
                    }),
                  ),
                );
              }),
      };
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            acquisitionOperationBarrier.resolve();
            if (
              accountAcquisitionOperations.get(acquisitionOperationKey) ===
              acquisitionOperation
            ) {
              accountAcquisitionOperations.delete(acquisitionOperationKey);
            }
            if (!didAdoptNetwork) {
              try {
                acquireProps.network?.releaseFrontendApi?.();
              } catch {
                // The capability was never stored. A local disposal failure
                // must not replace the authoritative typed acquisition failure.
              }
            }
          }),
        ),
      );
    }),
    stageAccountFrontendCommand: Effect.fn(
      'BrowserPartitionController.stageAccountFrontendCommand',
    )(function* (stageProps) {
      let matchedEntry: IAccountReplicaEntry | null = null;
      let matchedRegistration: IAccountSessionRegistration | null = null;
      for (const entry of accountEntries.values()) {
        const registration = entry.sessions.get(stageProps.sessionId);
        if (registration !== undefined) {
          matchedEntry = entry;
          matchedRegistration = registration;
          break;
        }
      }
      if (matchedEntry === null || matchedRegistration === null) {
        return yield* new ZerospinError({
          code: 'account-frontend-session-registration-missing',
          message:
            'Cannot stage through SharedWorker before the account session is hydrated',
        });
      }
      if (matchedEntry.role !== 'active') {
        return yield* new ZerospinError({
          code: 'commissioned-account-frontend-is-read-only',
          message: 'A commissioned account frontend cannot stage commands',
        });
      }
      if (matchedEntry.isUpdateRequired) {
        return yield* new ZerospinError({
          code: 'frontend-update-required',
          message:
            'The account frontend must load matching code before staging more commands',
        });
      }
      const encodedResult = yield* Effect.tryPromise({
        try: () =>
          matchedEntry.root.partitionApi.stageFrontendCommand({
            target: matchedEntry.target,
            baseReplicaIndex: stageProps.baseReplicaIndex,
            command: stageProps.command,
            mutations: stageProps.mutations,
          }),
        catch: ZerospinError.catch({
          code: 'account-frontend-command-stage-transport-failed',
          message: 'Failed to submit the account command to SharedWorker',
        }),
      });
      const result = yield* decodeRpc(encodedResult);
      if (result.commandId !== stageProps.command.id) {
        return yield* new ZerospinError({
          code: 'account-frontend-command-stage-result-mismatch',
          message: 'SharedWorker returned a different staged command ID',
          extra: {
            expectedCommandId: stageProps.command.id,
            actualCommandId: result.commandId,
          },
        });
      }
      if (matchedRegistration.replicaIndex !== result.replicaIndex) {
        return yield* new ZerospinError({
          code: 'durable-stage-main-thread-application-failed',
          message:
            'SharedWorker committed the command but this session did not commit its emitted replica transaction',
          extra: {
            commandId: stageProps.command.id,
            committedReplicaIndex: result.replicaIndex,
            appliedReplicaIndex: matchedRegistration.replicaIndex,
          },
        });
      }
    }),
    acquireServiceFrontendReplica: Effect.fn(
      'BrowserPartitionController.acquireServiceFrontendReplica',
    )(function* (acquireProps) {
      const commissionOwnerId = acquireProps.commissionOwnerId;
      const acquisitionOperationKey = [
        acquireProps.apiUrl,
        acquireProps.publishableKey,
        partitionKey,
        'service',
        acquireProps.frontend.systemName,
        acquireProps.serviceName,
        acquireProps.actorName,
        acquireProps.frontendName,
      ].join('|');
      const previousAcquisitionOperation =
        serviceAcquisitionOperations.get(acquisitionOperationKey) ??
        Promise.resolve();
      const acquisitionOperationBarrier = Promise.withResolvers<void>();
      const acquisitionOperation = previousAcquisitionOperation.then(
        () => acquisitionOperationBarrier.promise,
      );
      serviceAcquisitionOperations.set(
        acquisitionOperationKey,
        acquisitionOperation,
      );
      let didAdoptNetwork = acquireProps.network === null;

      return yield* Effect.gen(function* () {
        // Service authority, version, and generation changes for this authored
        // frontend share one mutation lane. Operation-scoped ticket borrowing
        // and ordinary authority upgrades therefore cannot release or clear
        // each other's transports.
        yield* Effect.promise(() => previousAcquisitionOperation);
      if (!isSharedWorkerEnabled) {
        return yield* new ZerospinError({
          code: 'shared-worker-mode-disabled',
          message:
            'Cannot acquire a worker replica while direct mode is selected',
        });
      }
      if (acquireProps.role === 'commissioned' && commissionOwnerId === null) {
        return yield* new ZerospinError({
          code: 'service-frontend-commission-owner-missing',
          message: 'Commissioned service replica acquisition requires an owner',
        });
      }
      if (
        acquireProps.frontend.serviceName !== acquireProps.serviceName ||
        acquireProps.frontend.actorName !== acquireProps.actorName ||
        acquireProps.frontend.frontendName !== acquireProps.frontendName ||
        acquireProps.frontend.version !== acquireProps.frontendVersion
      ) {
        return yield* new ZerospinError({
          code: 'service-frontend-compiled-acquisition-target-mismatch',
          message:
            'Compiled service frontend does not match the replica acquisition target',
        });
      }

      const apiOrigin = new URL(acquireProps.apiUrl).origin;
      const cacheKeyPrefix = `${apiOrigin}|${acquireProps.publishableKey}|${partitionKey}|service|`;
      const sourceLocators: ICachedServiceFrontendLocator[] = [];
      const conflictingLocators: ICachedServiceFrontendLocator[] = [];
      if (
        acquireProps.authority === 'online' &&
        acquireProps.role === 'active'
      ) {
        const locators = { ...locatorStore.getState().locators };
        let removedInvalidLocator = false;

        for (const [cacheKey, locator] of Object.entries(locators)) {
          if (
            !cacheKey.startsWith(cacheKeyPrefix) ||
            locator.kind !== 'service'
          ) {
            continue;
          }
          if (
            locator.systemName !== acquireProps.frontend.systemName ||
            locator.serviceName !== acquireProps.serviceName ||
            locator.actorName !== acquireProps.actorName ||
            locator.frontendName !== acquireProps.frontendName
          ) {
            continue;
          }
          if (
            !Number.isFinite(locator.authenticatedAt) ||
            !Number.isFinite(locator.expiresAt) ||
            locator.expiresAt !==
              locator.authenticatedAt + locatorTtlMilliseconds
          ) {
            delete locators[cacheKey];
            removedInvalidLocator = true;
            continue;
          }
          if (
            locator.actorId !== acquireProps.actorId ||
            locator.systemId !== acquireProps.systemId
          ) {
            delete locators[cacheKey];
            removedInvalidLocator = true;
            conflictingLocators.push(locator);
            continue;
          }
          if (
            locator.role !== 'active' ||
            (locator.generationId === acquireProps.generationId &&
              locator.frontendVersion === acquireProps.frontendVersion)
          ) {
            continue;
          }
          if (
            sourceLocators.some(
              existing =>
                existing.generationId === locator.generationId &&
                existing.frontendVersion === locator.frontendVersion,
            )
          ) {
            continue;
          }
          sourceLocators.push(locator);
        }

        if (removedInvalidLocator) {
          locatorStore.setState({ locators });
        }
        sourceLocators.sort(
          (left, right) => left.authenticatedAt - right.authenticatedAt,
        );

        for (const conflictingLocator of conflictingLocators) {
          for (const [
            conflictingEntryKey,
            conflictingEntry,
          ] of serviceEntries) {
            if (
              conflictingEntry.root.systemId !== conflictingLocator.systemId ||
              conflictingEntry.root.generationId !==
                conflictingLocator.generationId ||
              conflictingEntry.target.serviceName !==
                conflictingLocator.serviceName ||
              conflictingEntry.target.actorId !== conflictingLocator.actorId ||
              conflictingEntry.target.actorName !==
                conflictingLocator.actorName ||
              conflictingEntry.target.frontendName !==
                conflictingLocator.frontendName ||
              conflictingEntry.target.frontendVersion !==
                conflictingLocator.frontendVersion
            ) {
              continue;
            }
            conflictingEntry.isReleased = true;
            conflictingEntry.transportRegain = null;
            try {
              conflictingEntry.removeTransportRegainListener?.();
            } catch {
              // Continue revoking the conflicting service capability.
            } finally {
              conflictingEntry.removeTransportRegainListener = null;
            }
            for (const registration of conflictingEntry.sessions.values()) {
              if (!registration.isReleased) {
                registration.isReleased = true;
                registration.releaseError = new ZerospinError({
                  code: 'service-frontend-authority-replaced',
                  message:
                    'A newer authoritative service identity replaced this frontend acquisition',
                });
                registration.operation = registration.operation.then(() =>
                  registration.teardown(registration.releaseError),
                );
              }
              yield* Effect.promise(() =>
                registration.operation.catch(() => undefined),
              );
            }
            yield* Effect.gen(function* () {
              const encodedRelease = yield* Effect.tryPromise({
                try: () => conflictingEntry.acquiredApi.release(),
                catch: ZerospinError.catch({
                  code: 'conflicting-service-frontend-release-transport-failed',
                  message:
                    'Failed to release a superseded service frontend acquisition',
                }),
              });
              yield* decodeRpc(encodedRelease);
            }).pipe(
              Effect.ensuring(
                Effect.sync(() => {
                  try {
                    conflictingEntry.network?.releaseFrontendApi?.();
                  } catch {
                    // Remote revocation remains authoritative if local service
                    // capability disposal fails.
                  } finally {
                    conflictingEntry.network = null;
                    conflictingEntry.sessions.clear();
                    serviceEntries.delete(conflictingEntryKey);
                  }
                }),
              ),
              Effect.catchAll(() => Effect.void),
            );
          }
        }
      }

      const requiresActivationHandoff = sourceLocators.length > 0;
      const initialRole = requiresActivationHandoff
        ? 'commissioned'
        : acquireProps.role;
      const root = yield* getWorkerRoot(acquireProps);
      const entryKey = [
        root.id,
        acquireProps.serviceName,
        acquireProps.actorId,
        acquireProps.frontendName,
        acquireProps.frontendVersion,
      ].join('|');
      let entry = serviceEntries.get(entryKey);

      if (entry === undefined) {
        let nextEntry: IServiceReplicaEntry | null = null;
        const provider = new ServiceProvider(
          () => nextEntry,
          acquireProps.network,
        );
        const encodedAcquiredApi = yield* Effect.tryPromise({
          try: () =>
            root.partitionApi.acquireServiceFrontendReplica({
              serviceName: acquireProps.serviceName,
              actorId: acquireProps.actorId,
              actorName: acquireProps.actorName,
              frontendName: acquireProps.frontendName,
              frontendVersion: acquireProps.frontendVersion,
              frontendSpec: acquireProps.frontendSpec,
              frontendSpecHash: acquireProps.frontendSpecHash,
              authority: acquireProps.authority,
              role: initialRole,
              provider,
            }),
          catch: ZerospinError.catch({
            code: 'service-frontend-replica-acquisition-transport-failed',
            message: 'Failed to call SharedWorker service replica acquisition',
          }),
        });
        const acquiredApi = yield* decodeRpc(encodedAcquiredApi);
        if (isReleased || serviceEntries.has(entryKey)) {
          yield* Effect.promise(async () => {
            await Promise.resolve()
              .then(() => acquiredApi.release())
              .then(encodedRelease =>
                Effect.runPromise(decodeRpc(encodedRelease)),
              )
              .catch(() => undefined);
          });
          return yield* new ZerospinError({
            code: isReleased
              ? 'browser-partition-controller-released'
              : 'service-frontend-replica-acquisition-superseded',
            message: isReleased
              ? 'Browser partition controller was released during service replica acquisition'
              : 'Another service replica acquisition became current before this one could be inserted',
          });
        }
        nextEntry = {
          key: entryKey,
          root,
          target: {
            systemName: acquireProps.frontend.systemName,
            serviceName: acquireProps.serviceName,
            actorId: acquireProps.actorId,
            actorName: acquireProps.actorName,
            frontendName: acquireProps.frontendName,
            frontendVersion: acquireProps.frontendVersion,
          },
          frontendSpec: acquireProps.frontendSpec,
          frontendSpecHash: acquireProps.frontendSpecHash,
          network: acquireProps.network,
          stateAcquisitionNetwork: null,
          ticketAcquisitionNetwork: null,
          provider,
          acquiredApi,
          authority: acquireProps.authority,
          role: initialRole,
          hasActiveOwner: initialRole === 'active',
          commissionOwnerIds:
            commissionOwnerId === null
              ? new Set()
              : new Set([commissionOwnerId]),
          sessions: new Map(),
          isReleased: false,
          isUpdateRequired: false,
          transportRegain: acquireProps.transportRegain,
          transportRegainOperation: null,
          removeTransportRegainListener: null,
        };
        didAdoptNetwork = true;
        entry = nextEntry;
        serviceEntries.set(entryKey, entry);
      } else {
        const existingEntry = entry;
        if (existingEntry.network === acquireProps.network) {
          didAdoptNetwork = true;
        }
        if (
          isReleased ||
          existingEntry.isReleased ||
          serviceEntries.get(entryKey) !== existingEntry
        ) {
          return yield* new ZerospinError({
            code: 'service-frontend-replica-acquisition-released',
            message:
              'Service replica acquisition was released before it could accept another owner or network',
          });
        }
        const upgradesAuthority =
          existingEntry.authority === 'cached-offline' &&
          acquireProps.authority === 'online';
        const cachedOfflineLocator = upgradesAuthority
          ? controller.getCachedServiceFrontendLocator({
              apiUrl: acquireProps.apiUrl,
              publishableKey: acquireProps.publishableKey,
              frontend: acquireProps.frontend,
              role: 'active',
            })
          : null;
        const upgradesRole =
          existingEntry.role === 'commissioned' && initialRole === 'active';
        if (upgradesAuthority || upgradesRole) {
          if (existingEntry.isReleased) {
            return yield* new ZerospinError({
              code: 'service-frontend-replica-acquisition-released',
              message:
                'Service replica acquisition was released before its authority upgrade',
            });
          }
          const pendingNetwork =
            acquireProps.network !== null &&
            existingEntry.network !== acquireProps.network
              ? acquireProps.network
              : null;
          existingEntry.stateAcquisitionNetwork = pendingNetwork;
          const upgradedApi = yield* Effect.gen(function* () {
            const encodedAcquiredApi = yield* Effect.tryPromise({
              try: () =>
                root.partitionApi.acquireServiceFrontendReplica({
                  serviceName: acquireProps.serviceName,
                  actorId: acquireProps.actorId,
                  actorName: acquireProps.actorName,
                  frontendName: acquireProps.frontendName,
                  frontendVersion: acquireProps.frontendVersion,
                  frontendSpec: acquireProps.frontendSpec,
                  frontendSpecHash: acquireProps.frontendSpecHash,
                  authority: upgradesAuthority
                    ? 'online'
                    : existingEntry.authority,
                  role: upgradesRole ? 'active' : existingEntry.role,
                  provider: existingEntry.provider,
                }),
              catch: ZerospinError.catch({
                code: 'service-frontend-replica-upgrade-transport-failed',
                message:
                  'Failed to upgrade SharedWorker service replica acquisition',
              }),
            });
            return yield* decodeRpc(encodedAcquiredApi);
          }).pipe(
            Effect.tapError(() =>
              Effect.sync(() => {
                if (existingEntry.stateAcquisitionNetwork === pendingNetwork) {
                  existingEntry.stateAcquisitionNetwork = null;
                }
              }),
            ),
          );
          if (
            isReleased ||
            existingEntry.isReleased ||
            serviceEntries.get(entryKey) !== existingEntry
          ) {
            if (existingEntry.stateAcquisitionNetwork === pendingNetwork) {
              existingEntry.stateAcquisitionNetwork = null;
            }
            yield* Effect.promise(async () => {
              await Promise.resolve()
                .then(() => upgradedApi.release())
                .then(encodedRelease =>
                  Effect.runPromise(decodeRpc(encodedRelease)),
                )
                .catch(() => undefined);
            });
            return yield* new ZerospinError({
              code: 'service-frontend-replica-upgrade-released',
              message:
                'Service replica acquisition was released while its authority upgrade was in flight',
            });
          }
          if (existingEntry.stateAcquisitionNetwork === pendingNetwork) {
            existingEntry.stateAcquisitionNetwork = null;
          }
          if (
            pendingNetwork !== null &&
            existingEntry.network !== pendingNetwork
          ) {
            const previousNetwork = existingEntry.network;
            existingEntry.network = pendingNetwork;
            didAdoptNetwork = true;
            try {
              previousNetwork?.releaseFrontendApi?.();
            } catch {
              // The retained entry already owns the new service capability.
              // Failure to dispose the prior local transport cannot undo it.
            }
          }
          existingEntry.acquiredApi = upgradedApi;
          if (upgradesAuthority) {
            existingEntry.authority = 'online';
            for (const registration of existingEntry.sessions.values()) {
              if (!registration.isReleased) {
                registration.setOnline();
              }
            }
            if (
              cachedOfflineLocator !== null &&
              !isReleased &&
              !existingEntry.isReleased &&
              serviceEntries.get(entryKey) === existingEntry
            ) {
              controller.setCachedServiceFrontendLocator({
                apiUrl: acquireProps.apiUrl,
                publishableKey: acquireProps.publishableKey,
                frontend: acquireProps.frontend,
                role: 'active',
                identity: {
                  systemName: acquireProps.frontend.systemName,
                  serviceName: acquireProps.serviceName,
                  actorName: acquireProps.actorName,
                  actorId: acquireProps.actorId,
                  frontendName: acquireProps.frontendName,
                  frontendVersion: acquireProps.frontendVersion,
                  systemId: acquireProps.systemId,
                  generationId: acquireProps.generationId,
                  systemVersion: acquireProps.systemVersion,
                  systemWorkerName: cachedOfflineLocator.systemWorkerName,
                },
              });
            }
          }
          if (upgradesRole) {
            existingEntry.role = 'active';
            existingEntry.hasActiveOwner = true;
          }
        }
        if (commissionOwnerId !== null) {
          existingEntry.commissionOwnerIds.add(commissionOwnerId);
        }
        if (
          existingEntry.transportRegain === null &&
          acquireProps.transportRegain !== null
        ) {
          existingEntry.transportRegain = acquireProps.transportRegain;
        }
        if (
          acquireProps.network !== null &&
          existingEntry.network !== acquireProps.network
        ) {
          const previousNetwork = existingEntry.network;
          existingEntry.network = acquireProps.network;
          didAdoptNetwork = true;
          try {
            previousNetwork?.releaseFrontendApi?.();
          } catch {
            // Keep the newly adopted service transport reachable even if the
            // superseded local capability throws during disposal.
          }
        }
      }

      const acquiredEntry = serviceEntries.get(entryKey);
      if (
        acquiredEntry === undefined ||
        acquiredEntry !== entry ||
        isReleased ||
        acquiredEntry.isReleased
      ) {
        return yield* new ZerospinError({
          code: 'service-frontend-replica-acquisition-missing',
          message:
            'Service replica acquisition disappeared or was released before hydration',
        });
      }

      if (acquiredEntry.transportRegain === null) {
        for (const sourceLocator of sourceLocators) {
          if (
            sourceLocator.frontendVersion !==
            acquiredEntry.target.frontendVersion
          ) {
            continue;
          }
          for (const sourceEntry of serviceEntries.values()) {
            if (
              sourceEntry === acquiredEntry ||
              sourceEntry.root.systemId !== sourceLocator.systemId ||
              sourceEntry.root.generationId !== sourceLocator.generationId ||
              sourceEntry.target.serviceName !== sourceLocator.serviceName ||
              sourceEntry.target.actorId !== sourceLocator.actorId ||
              sourceEntry.target.actorName !== sourceLocator.actorName ||
              sourceEntry.target.frontendName !== sourceLocator.frontendName ||
              sourceEntry.target.frontendVersion !==
                sourceLocator.frontendVersion ||
              sourceEntry.transportRegain === null
            ) {
              continue;
            }
            acquiredEntry.transportRegain = sourceEntry.transportRegain;
            break;
          }
          if (acquiredEntry.transportRegain !== null) {
            break;
          }
        }
      }

      // Service replicas have no command journal to adapt, but a generation
      // switch still waits for the source worker to persist the exact boundary
      // control. Only a null pending transition is retried; a malformed or
      // mismatched non-null transition fails closed immediately.
      for (const sourceLocator of sourceLocators) {
        const sourceRoot = yield* getWorkerRoot({
          apiUrl: acquireProps.apiUrl,
          publishableKey: acquireProps.publishableKey,
          systemId: sourceLocator.systemId,
          generationId: sourceLocator.generationId,
        });
        let borrowedSourceEntry: IServiceReplicaEntry | null = null;
        const borrowedTicketNetwork = acquiredEntry.network;
        for (const sourceEntry of serviceEntries.values()) {
          if (
            sourceEntry === acquiredEntry ||
            sourceEntry.root.systemId !== sourceLocator.systemId ||
            sourceEntry.root.generationId !== sourceLocator.generationId ||
            sourceEntry.target.serviceName !== sourceLocator.serviceName ||
            sourceEntry.target.actorId !== sourceLocator.actorId ||
            sourceEntry.target.actorName !== sourceLocator.actorName ||
            sourceEntry.target.frontendName !== sourceLocator.frontendName ||
            sourceEntry.target.frontendVersion !== sourceLocator.frontendVersion
          ) {
            continue;
          }
          borrowedSourceEntry = sourceEntry;
          break;
        }
        if (borrowedSourceEntry !== null && borrowedTicketNetwork !== null) {
          borrowedSourceEntry.ticketAcquisitionNetwork = borrowedTicketNetwork;
        }
        yield* Effect.gen(function* () {
          if (borrowedSourceEntry !== null) {
            const encodedRestartedSourceApi = yield* Effect.tryPromise({
              try: () =>
                sourceRoot.partitionApi.acquireServiceFrontendReplica({
                  serviceName: borrowedSourceEntry.target.serviceName,
                  actorId: borrowedSourceEntry.target.actorId,
                  actorName: borrowedSourceEntry.target.actorName,
                  frontendName: borrowedSourceEntry.target.frontendName,
                  frontendVersion: borrowedSourceEntry.target.frontendVersion,
                  frontendSpec: borrowedSourceEntry.frontendSpec,
                  frontendSpecHash: borrowedSourceEntry.frontendSpecHash,
                  authority: 'online',
                  role: borrowedSourceEntry.role,
                  provider: borrowedSourceEntry.provider,
                }),
              catch: ZerospinError.catch({
                code: 'source-service-frontend-reconnect-transport-failed',
                message:
                  'Failed to restart the source service replica with successor transport',
              }),
            });
            borrowedSourceEntry.acquiredApi = yield* decodeRpc(
              encodedRestartedSourceApi,
            );
            borrowedSourceEntry.authority = 'online';
          }
          let lineageIsProven = false;
          while (!lineageIsProven) {
            const encodedSourceReplicas = yield* Effect.tryPromise({
              try: () => sourceRoot.partitionApi.listServiceFrontendReplicas(),
              catch: ZerospinError.catch({
                code: 'service-frontend-lineage-preflight-transport-failed',
                message:
                  'Failed to read the source service replica lineage transition',
              }),
            });
            const sourceReplicas = yield* decodeRpc(encodedSourceReplicas);
            const sourceReplica = sourceReplicas.find(
              replica =>
                replica.status === 'ready' &&
                replica.role === 'active' &&
                replica.serviceName === sourceLocator.serviceName &&
                replica.actorId === sourceLocator.actorId &&
                replica.actorName === sourceLocator.actorName &&
                replica.frontendName === sourceLocator.frontendName &&
                replica.frontendVersion === sourceLocator.frontendVersion,
            );
            if (sourceReplica === undefined) {
              return yield* new ZerospinError({
                code: 'service-frontend-lineage-source-not-ready',
                message:
                  'The cached source service replica has no exact ready active catalog row',
              });
            }
            if (sourceReplica.pendingTransition !== null) {
              if (
                sourceReplica.pendingTransition.systemId !==
                  acquireProps.systemId ||
                sourceReplica.pendingTransition.generationId !==
                  acquireProps.generationId ||
                sourceReplica.pendingTransition.serviceName !==
                  acquireProps.serviceName ||
                sourceReplica.pendingTransition.actorId !==
                  acquireProps.actorId ||
                sourceReplica.pendingTransition.actorName !==
                  acquireProps.actorName ||
                sourceReplica.pendingTransition.frontendName !==
                  acquireProps.frontendName ||
                sourceReplica.pendingTransition.frontendVersion !==
                  acquireProps.frontendVersion
              ) {
                return yield* new ZerospinError({
                  code: 'service-frontend-lineage-target-mismatch',
                  message:
                    'The persisted source service transition does not name the authenticated target',
                });
              }
              lineageIsProven = true;
              continue;
            }
            if (sourceLocator.generationId === acquireProps.generationId) {
              lineageIsProven = true;
              continue;
            }
            if (borrowedSourceEntry === null) {
              return yield* new ZerospinError({
                code: 'service-frontend-lineage-source-capability-missing',
                message:
                  'Source service lineage is pending but no exact Config capability can obtain its successor ticket',
              });
            }
            if (
              isReleased ||
              acquiredEntry.isReleased ||
              serviceEntries.get(entryKey) !== acquiredEntry ||
              borrowedSourceEntry.isReleased
            ) {
              return yield* new ZerospinError({
                code: 'service-frontend-replica-activation-released',
                message:
                  'Service replica acquisition was released while waiting for source lineage',
              });
            }
            yield* Effect.sleep(Duration.millis(50));
          }
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              if (
                borrowedSourceEntry !== null &&
                borrowedSourceEntry.ticketAcquisitionNetwork ===
                  borrowedTicketNetwork
              ) {
                borrowedSourceEntry.ticketAcquisitionNetwork = null;
              }
            }),
          ),
        );
      }

      if (
        acquiredEntry.transportRegain !== null &&
        acquiredEntry.removeTransportRegainListener === null &&
        typeof globalThis.addEventListener === 'function'
      ) {
        const handleTransportRegain = () => {
          if (
            isReleased ||
            acquiredEntry.isReleased ||
            serviceEntries.get(entryKey) !== acquiredEntry ||
            acquiredEntry.transportRegain === null ||
            acquiredEntry.transportRegainOperation !== null
          ) {
            return;
          }
          const transportRegain = acquiredEntry.transportRegain;
          const transportRegainOperation = Promise.resolve()
            .then(() => transportRegain())
            .then(outcome => {
              if (
                outcome !== 'update-required' ||
                isReleased ||
                acquiredEntry.isReleased ||
                serviceEntries.get(entryKey) !== acquiredEntry
              ) {
                return;
              }
              acquiredEntry.isUpdateRequired = true;
              for (const registration of acquiredEntry.sessions.values()) {
                if (!registration.isReleased) {
                  registration.setUpdateRequired();
                }
              }
            })
            .catch(() => undefined)
            .finally(() => {
              if (
                acquiredEntry.transportRegainOperation ===
                transportRegainOperation
              ) {
                acquiredEntry.transportRegainOperation = null;
              }
            });
          acquiredEntry.transportRegainOperation = transportRegainOperation;
        };
        globalThis.addEventListener('online', handleTransportRegain);
        acquiredEntry.removeTransportRegainListener = () => {
          globalThis.removeEventListener('online', handleTransportRegain);
        };
      }

      // Service replicas have no local command journal to adapt. Keep the
      // authenticated target commissioned until its ready acquisition exists,
      // then activate it before any Provider replaces its main-thread state.
      if (requiresActivationHandoff) {
        const encodedActivatedApi = yield* Effect.tryPromise({
          try: () =>
            root.partitionApi.acquireServiceFrontendReplica({
              serviceName: acquireProps.serviceName,
              actorId: acquireProps.actorId,
              actorName: acquireProps.actorName,
              frontendName: acquireProps.frontendName,
              frontendVersion: acquireProps.frontendVersion,
              frontendSpec: acquireProps.frontendSpec,
              frontendSpecHash: acquireProps.frontendSpecHash,
              authority: acquireProps.authority,
              role: 'active',
              provider: acquiredEntry.provider,
            }),
          catch: ZerospinError.catch({
            code: 'service-frontend-replica-activation-transport-failed',
            message:
              'Target service replica became ready but activation failed',
          }),
        });
        const activatedApi = yield* decodeRpc(encodedActivatedApi);
        if (
          isReleased ||
          acquiredEntry.isReleased ||
          serviceEntries.get(entryKey) !== acquiredEntry
        ) {
          yield* Effect.promise(async () => {
            await Promise.resolve()
              .then(() => activatedApi.release())
              .then(encodedRelease =>
                Effect.runPromise(decodeRpc(encodedRelease)),
              )
              .catch(() => undefined);
          });
          return yield* new ZerospinError({
            code: 'service-frontend-replica-activation-released',
            message:
              'Service replica acquisition was released while activation was in flight',
          });
        }
        acquiredEntry.acquiredApi = activatedApi;
        acquiredEntry.role = 'active';
        acquiredEntry.hasActiveOwner = true;
      }

      let didTransferServiceSession = false;
      let transferredServiceSystemWorkerName: string | null = null;
      for (const sourceLocator of sourceLocators) {
        if (
          sourceLocator.frontendVersion !== acquiredEntry.target.frontendVersion
        ) {
          for (const sourceEntry of serviceEntries.values()) {
            if (
              sourceEntry === acquiredEntry ||
              sourceEntry.root.systemId !== sourceLocator.systemId ||
              sourceEntry.root.generationId !== sourceLocator.generationId ||
              sourceEntry.target.serviceName !== sourceLocator.serviceName ||
              sourceEntry.target.actorId !== sourceLocator.actorId ||
              sourceEntry.target.actorName !== sourceLocator.actorName ||
              sourceEntry.target.frontendName !== sourceLocator.frontendName ||
              sourceEntry.target.frontendVersion !==
                sourceLocator.frontendVersion
            ) {
              continue;
            }
            sourceEntry.isUpdateRequired = true;
            for (const registration of sourceEntry.sessions.values()) {
              if (!registration.isReleased) {
                registration.setUpdateRequired();
              }
            }
          }
          continue;
        }
        for (const sourceEntry of serviceEntries.values()) {
          if (
            sourceEntry === acquiredEntry ||
            sourceEntry.root.systemId !== sourceLocator.systemId ||
            sourceEntry.root.generationId !== sourceLocator.generationId ||
            sourceEntry.target.serviceName !== sourceLocator.serviceName ||
            sourceEntry.target.actorId !== sourceLocator.actorId ||
            sourceEntry.target.actorName !== sourceLocator.actorName ||
            sourceEntry.target.frontendName !== sourceLocator.frontendName ||
            sourceEntry.target.frontendVersion !== sourceLocator.frontendVersion
          ) {
            continue;
          }

          for (const [sessionId, registration] of sourceEntry.sessions) {
            if (registration.isReleased) {
              continue;
            }
            if (!registration.isHydrated) {
              yield* Effect.promise(() =>
                registration.operation.catch(() => undefined),
              );
            }
            if (
              registration.isReleased ||
              !registration.isHydrated ||
              sourceEntry.sessions.get(sessionId) !== registration
            ) {
              continue;
            }
            if (registration.isRepairScheduled) {
              yield* Effect.promise(
                () =>
                  new Promise<void>(resolve => {
                    setTimeout(resolve, 0);
                  }),
              );
            }
            yield* Effect.promise(() =>
              registration.operation.catch(() => undefined),
            );
            registration.isRepairScheduled = false;
            if (
              registration.isReleased ||
              sourceEntry.sessions.get(sessionId) !== registration
            ) {
              continue;
            }

            const sourceReplicaIndex = registration.replicaIndex;
            sourceEntry.sessions.delete(sessionId);
            registration.isRepairing = true;
            registration.queuedBlocks = [];
            registration.setRepairing();
            acquiredEntry.sessions.set(sessionId, registration);
            const targetRepairOperation = registration.operation.then(() =>
              repairServiceSession(acquiredEntry, registration),
            );
            registration.operation = targetRepairOperation.then(
              () => undefined,
            );
            const targetRepair = yield* Effect.promise(
              () => targetRepairOperation,
            );
            if (registration.isReleased) {
              acquiredEntry.sessions.delete(sessionId);
              continue;
            }
            if (
              targetRepair.phase === 'failed-before-target-replacement'
            ) {
              acquiredEntry.sessions.delete(sessionId);
              registration.replicaIndex = sourceReplicaIndex;
              registration.isRepairing = true;
              registration.queuedBlocks = [];
              registration.setRepairing();
              sourceEntry.sessions.set(sessionId, registration);
              const sourceRepairOperation = registration.operation.then(() =>
                repairServiceSession(sourceEntry, registration),
              );
              registration.operation = sourceRepairOperation.then(
                () => undefined,
              );
              const sourceRepair = yield* Effect.promise(
                () => sourceRepairOperation,
              );
              if (registration.isReleased) {
                sourceEntry.sessions.delete(sessionId);
                continue;
              }
              sourceEntry.isUpdateRequired = true;
              if (sourceRepair.phase === 'complete') {
                registration.setUpdateRequired();
              } else {
                registration.isRepairing = false;
              }
              continue;
            }

            registration.isRepairing = false;
            if (targetRepair.phase === 'complete') {
              registration.setOnline();
            }
            didTransferServiceSession = true;
            if (transferredServiceSystemWorkerName === null) {
              transferredServiceSystemWorkerName =
                targetRepair.systemWorkerName;
            }
          }
        }
      }

      if (didTransferServiceSession) {
        if (transferredServiceSystemWorkerName === null) {
          return yield* new ZerospinError({
            code: 'service-frontend-transferred-state-identity-missing',
            message:
              'Target service replacement committed without its worker identity',
          });
        }
        controller.setCachedServiceFrontendLocator({
          apiUrl: acquireProps.apiUrl,
          publishableKey: acquireProps.publishableKey,
          frontend: acquireProps.frontend,
          role: 'active',
          identity: {
            systemName: acquireProps.frontend.systemName,
            serviceName: acquireProps.serviceName,
            actorName: acquireProps.actorName,
            actorId: acquireProps.actorId,
            frontendName: acquireProps.frontendName,
            frontendVersion: acquireProps.frontendVersion,
            systemId: acquireProps.systemId,
            generationId: acquireProps.generationId,
            systemVersion: acquireProps.systemVersion,
            systemWorkerName: transferredServiceSystemWorkerName,
          },
        });

        for (const sourceLocator of sourceLocators) {
          if (
            sourceLocator.frontendVersion !==
            acquiredEntry.target.frontendVersion
          ) {
            continue;
          }
          for (const [sourceEntryKey, sourceEntry] of serviceEntries) {
            if (
              sourceEntry === acquiredEntry ||
              sourceEntry.root.systemId !== sourceLocator.systemId ||
              sourceEntry.root.generationId !== sourceLocator.generationId ||
              sourceEntry.target.serviceName !== sourceLocator.serviceName ||
              sourceEntry.target.actorId !== sourceLocator.actorId ||
              sourceEntry.target.actorName !== sourceLocator.actorName ||
              sourceEntry.target.frontendName !== sourceLocator.frontendName ||
              sourceEntry.target.frontendVersion !==
                sourceLocator.frontendVersion ||
              sourceEntry.sessions.size > 0
            ) {
              continue;
            }
            const sourceRelease = yield* Effect.tryPromise({
              try: () => sourceEntry.acquiredApi.release(),
              catch: ZerospinError.catch({
                code: 'source-service-frontend-release-transport-failed',
                message:
                  'Target locator committed but the empty source service acquisition could not be released',
              }),
            }).pipe(Effect.flatMap(decodeRpc), Effect.either);
            if (Either.isLeft(sourceRelease)) {
              continue;
            }
            sourceEntry.isReleased = true;
            sourceEntry.transportRegain = null;
            try {
              sourceEntry.removeTransportRegainListener?.();
            } catch {
              // Service target publication is complete; continue cleanup.
            } finally {
              sourceEntry.removeTransportRegainListener = null;
            }
            try {
              sourceEntry.network?.releaseFrontendApi?.();
            } catch {
              // Service target ownership is already published and durable.
            } finally {
              sourceEntry.network = null;
              serviceEntries.delete(sourceEntryKey);
            }
          }
        }
      }

      return {
        hydrateSession: Effect.fn(
          'ServiceFrontendReplicaAcquisition.hydrateSession',
        )(function* (hydrateProps) {
          const hydrationBarrier = Promise.withResolvers<void>();
          const registration: IServiceSessionRegistration = {
            ...hydrateProps,
            replicaIndex: null,
            isHydrated: false,
            isRepairing: false,
            isRepairScheduled: false,
            isReleased: false,
            releaseError: null,
            operation: hydrationBarrier.promise.catch(() => undefined),
            queuedBlocks: [],
          };
          acquiredEntry.sessions.set(hydrateProps.sessionId, registration);
          if (acquiredEntry.authority === 'online') {
            registration.setOnline();
          }
          if (acquiredEntry.isUpdateRequired) {
            registration.setUpdateRequired();
          }
          return yield* Effect.gen(function* () {
            const encodedState = yield* Effect.tryPromise({
              try: () => acquiredEntry.acquiredApi.getFrontendState(),
              catch: ZerospinError.catch({
                code: 'service-frontend-replica-state-transport-failed',
                message:
                  'Failed to read the SharedWorker service replica snapshot',
              }),
            });
            const serviceFrontendReplicaState = yield* decodeRpc(encodedState);
            if (registration.isReleased) {
              return yield* Effect.fail(
                registration.releaseError ??
                  new ZerospinError({
                    code: 'service-frontend-session-released-during-hydration',
                    message:
                      'Service frontend Provider was released while its worker snapshot was loading',
                  }),
              );
            }
            const encodedReplicas = yield* Effect.tryPromise({
              try: () =>
                acquiredEntry.root.partitionApi.listServiceFrontendReplicas(),
              catch: ZerospinError.catch({
                code: 'service-frontend-replica-catalog-read-failed',
                message:
                  'Failed to read the service replica catalog during hydration',
              }),
            });
            const replicas = yield* decodeRpc(encodedReplicas);
            if (registration.isReleased) {
              return yield* Effect.fail(
                registration.releaseError ??
                  new ZerospinError({
                    code: 'service-frontend-session-released-during-hydration',
                    message:
                      'Service frontend Provider was released while its worker catalog was loading',
                  }),
              );
            }
            const catalogRow = replicas.find(
              replica =>
                replica.status === 'ready' &&
                replica.role === acquiredEntry.role &&
                replica.serviceName === acquiredEntry.target.serviceName &&
                replica.actorId === acquiredEntry.target.actorId &&
                replica.actorName === acquiredEntry.target.actorName &&
                replica.frontendName === acquiredEntry.target.frontendName &&
                replica.frontendVersion ===
                  acquiredEntry.target.frontendVersion,
            );
            if (catalogRow === undefined) {
              return yield* new ZerospinError({
                code: 'service-frontend-replica-catalog-row-missing',
                message:
                  'Service frontend replica catalog row disappeared during hydration',
              });
            }
            const hydrationOperation = (async () => {
              if (registration.isReleased) {
                throw (
                  registration.releaseError ??
                  new ZerospinError({
                    code: 'service-frontend-session-released-during-hydration',
                    message:
                      'Service frontend Provider was released during hydration',
                  })
                );
              }
              await registration.replaceFrontendState(
                serviceFrontendReplicaState,
              );
              if (registration.isReleased) {
                throw (
                  registration.releaseError ??
                  new ZerospinError({
                    code: 'service-frontend-session-released-during-hydration',
                    message:
                      'Service frontend Provider was released during hydration',
                  })
                );
              }
              registration.setDatabaseName(catalogRow.databaseName);
              registration.replicaIndex =
                serviceFrontendReplicaState.replicaIndex;

              while (registration.queuedBlocks.length > 0) {
                const queuedBlocks = registration.queuedBlocks.toSorted(
                  (left, right) => left.replicaIndex - right.replicaIndex,
                );
                registration.queuedBlocks = [];
                for (const queuedBlock of queuedBlocks) {
                  if (registration.isReleased) {
                    throw (
                      registration.releaseError ??
                      new ZerospinError({
                        code: 'service-frontend-session-released-during-hydration',
                        message:
                          'Service frontend Provider was released during hydration',
                      })
                    );
                  }
                  if (
                    registration.replicaIndex !== null &&
                    queuedBlock.replicaIndex <= registration.replicaIndex
                  ) {
                    continue;
                  }
                  if (
                    registration.replicaIndex === null ||
                    queuedBlock.replicaIndex !== registration.replicaIndex + 1
                  ) {
                    throw new ZerospinError({
                      code: 'service-frontend-replica-catch-up-index-gap',
                      message:
                        'Queued service replica blocks are not contiguous during hydration',
                    });
                  }
                  await registration.handleServiceFrontendReplicaBlock(
                    queuedBlock,
                  );
                  registration.replicaIndex = queuedBlock.replicaIndex;
                }
              }
              registration.isHydrated = true;
            })();
            yield* Effect.tryPromise({
              try: () => hydrationOperation,
              catch: error =>
                ZerospinError.isZerospinError(error)
                  ? error
                  : ZerospinError.catch({
                      code: 'service-frontend-replica-hydration-failed',
                      message:
                        'Failed to hydrate the main-thread service database',
                    })(error),
            });

            if (acquireProps.authority === 'online') {
              controller.setCachedServiceFrontendLocator({
                apiUrl: acquireProps.apiUrl,
                publishableKey: acquireProps.publishableKey,
                frontend: acquireProps.frontend,
                role: 'active',
                identity: {
                  systemName: acquireProps.frontend.systemName,
                  serviceName: acquireProps.serviceName,
                  actorName: acquireProps.actorName,
                  actorId: acquireProps.actorId,
                  frontendName: acquireProps.frontendName,
                  frontendVersion: acquireProps.frontendVersion,
                  systemId: acquireProps.systemId,
                  generationId: acquireProps.generationId,
                  systemVersion: acquireProps.systemVersion,
                  systemWorkerName:
                    serviceFrontendReplicaState.systemWorkerName,
                },
              });
            }

            // Preserve every sibling source Provider. Only an exact same-session
            // registration is superseded by this newly hydrated target.
            for (const sourceLocator of sourceLocators) {
              for (const [sourceEntryKey, sourceEntry] of serviceEntries) {
                if (
                  sourceEntry === acquiredEntry ||
                  sourceEntry.root.systemId !== sourceLocator.systemId ||
                  sourceEntry.root.generationId !==
                    sourceLocator.generationId ||
                  sourceEntry.target.serviceName !==
                    sourceLocator.serviceName ||
                  sourceEntry.target.actorId !== sourceLocator.actorId ||
                  sourceEntry.target.actorName !== sourceLocator.actorName ||
                  sourceEntry.target.frontendName !==
                    sourceLocator.frontendName ||
                  sourceEntry.target.frontendVersion !==
                    sourceLocator.frontendVersion
                ) {
                  continue;
                }

                const sourceRegistration = sourceEntry.sessions.get(
                  hydrateProps.sessionId,
                );
                if (sourceRegistration !== undefined) {
                  if (!sourceRegistration.isReleased) {
                    sourceRegistration.isReleased = true;
                    sourceRegistration.operation =
                      sourceRegistration.operation.then(() =>
                        sourceRegistration.teardown(null),
                      );
                  }
                  yield* Effect.promise(() =>
                    sourceRegistration.operation.catch(() => undefined),
                  );
                  sourceEntry.sessions.delete(hydrateProps.sessionId);
                }

                if (sourceEntry.sessions.size > 0) {
                  continue;
                }
                const sourceRelease = yield* Effect.tryPromise({
                  try: () => sourceEntry.acquiredApi.release(),
                  catch: ZerospinError.catch({
                    code: 'source-service-frontend-release-transport-failed',
                    message:
                      'Target hydrated but the source service frontend acquisition could not be released',
                  }),
                }).pipe(Effect.flatMap(decodeRpc), Effect.either);
                if (Either.isLeft(sourceRelease)) {
                  continue;
                }
                sourceEntry.isReleased = true;
                sourceEntry.transportRegain = null;
                try {
                  sourceEntry.removeTransportRegainListener?.();
                } catch {
                  // Service target hydration is committed; continue cleanup.
                } finally {
                  sourceEntry.removeTransportRegainListener = null;
                }
                try {
                  sourceEntry.network?.releaseFrontendApi?.();
                } catch {
                  // Target hydration is committed even if local source disposal fails.
                }
                sourceEntry.network = null;
                sourceEntry.sessions.clear();
                serviceEntries.delete(sourceEntryKey);

                const locators = { ...locatorStore.getState().locators };
                for (const [cacheKey, locator] of Object.entries(locators)) {
                  if (
                    cacheKey.startsWith(cacheKeyPrefix) &&
                    locator.kind === 'service' &&
                    locator.role === 'active' &&
                    locator.systemName === sourceLocator.systemName &&
                    locator.serviceName === sourceLocator.serviceName &&
                    locator.actorName === sourceLocator.actorName &&
                    locator.actorId === sourceLocator.actorId &&
                    locator.frontendName === sourceLocator.frontendName &&
                    locator.frontendVersion === sourceLocator.frontendVersion &&
                    locator.systemId === sourceLocator.systemId &&
                    locator.generationId === sourceLocator.generationId
                  ) {
                    delete locators[cacheKey];
                  }
                }
                locatorStore.setState({ locators });
              }
            }

            return {
              serviceFrontendReplicaState,
              databaseName: catalogRow.databaseName,
              release: Effect.promise(async () => {
                if (!registration.isReleased) {
                  registration.isReleased = true;
                  registration.operation = registration.operation.then(() =>
                    registration.teardown(null),
                  );
                }
                await registration.operation.catch(() => undefined);
                for (const entry of serviceEntries.values()) {
                  if (
                    entry.sessions.get(hydrateProps.sessionId) === registration
                  ) {
                    entry.sessions.delete(hydrateProps.sessionId);
                  }
                }
              }),
            };
          }).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                hydrationBarrier.resolve();
              }),
            ),
            Effect.tapError(error =>
              Effect.sync(() => {
                hydrationBarrier.reject(error);
              }),
            ),
            Effect.tapError(error =>
              Effect.promise(async () => {
                if (!registration.isReleased) {
                  registration.isReleased = true;
                  registration.releaseError = error;
                  registration.operation = registration.operation.then(() =>
                    registration.teardown(error),
                  );
                }
                await registration.operation.catch(() => undefined);
                for (const entry of serviceEntries.values()) {
                  if (
                    entry.sessions.get(hydrateProps.sessionId) === registration
                  ) {
                    entry.sessions.delete(hydrateProps.sessionId);
                  }
                }
              }),
            ),
          );
        }),
        releaseCommissionOwner:
          commissionOwnerId === null
            ? Effect.fail(
                new ZerospinError({
                  code: 'service-frontend-commission-owner-missing',
                  message:
                    'This active service replica acquisition has no commission owner to release',
                }),
              )
            : Effect.gen(function* () {
                const currentEntry = serviceEntries.get(entryKey);
                if (currentEntry === undefined) {
                  return;
                }
                currentEntry.commissionOwnerIds.delete(commissionOwnerId);
                if (
                  currentEntry.hasActiveOwner ||
                  currentEntry.commissionOwnerIds.size > 0
                ) {
                  return;
                }
                yield* Effect.gen(function* () {
                  const encodedRelease = yield* Effect.tryPromise({
                    try: () => currentEntry.acquiredApi.release(),
                    catch: ZerospinError.catch({
                      code: 'service-frontend-commission-release-transport-failed',
                      message:
                        'Failed to release the commissioned service replica owner',
                    }),
                  });
                  yield* decodeRpc(encodedRelease);
                }).pipe(
                  Effect.ensuring(
                    Effect.sync(() => {
                      currentEntry.isReleased = true;
                      currentEntry.transportRegain = null;
                      try {
                        currentEntry.removeTransportRegainListener?.();
                      } catch {
                        // Continue exact service-owner teardown.
                      }
                      currentEntry.removeTransportRegainListener = null;
                      try {
                        currentEntry.network?.releaseFrontendApi?.();
                      } catch {
                        // Bookkeeping cleanup is not conditional on local disposal.
                      } finally {
                        currentEntry.network = null;
                        currentEntry.sessions.clear();
                        serviceEntries.delete(entryKey);
                      }
                    }),
                  ),
                );
              }),
      };
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            acquisitionOperationBarrier.resolve();
            if (
              serviceAcquisitionOperations.get(acquisitionOperationKey) ===
              acquisitionOperation
            ) {
              serviceAcquisitionOperations.delete(acquisitionOperationKey);
            }
            if (!didAdoptNetwork) {
              try {
                acquireProps.network?.releaseFrontendApi?.();
              } catch {
                // Preserve the typed result when disposal of an unadopted local
                // service capability itself fails.
              }
            }
          }),
        ),
      );
    }),
    async release() {
      if (isReleased) {
        return;
      }
      isReleased = true;

      for (const entry of accountEntries.values()) {
        entry.isReleased = true;
        entry.transportRegain = null;
        try {
          entry.removeTransportRegainListener?.();
        } catch {
          // Config teardown must continue through every owned capability.
        } finally {
          entry.removeTransportRegainListener = null;
        }
        try {
          entry.network?.releaseFrontendApi?.();
        } catch {
          // Continue revoking every local capability during Config teardown.
        } finally {
          entry.network = null;
        }
      }
      for (const entry of serviceEntries.values()) {
        entry.isReleased = true;
        entry.transportRegain = null;
        try {
          entry.removeTransportRegainListener?.();
        } catch {
          // Config teardown must continue through every service capability.
        } finally {
          entry.removeTransportRegainListener = null;
        }
        try {
          entry.network?.releaseFrontendApi?.();
        } catch {
          // Continue revoking every local capability during Config teardown.
        } finally {
          entry.network = null;
        }
      }

      const accountSessionReleasePromises: Promise<void>[] = [];
      for (const entry of accountEntries.values()) {
        for (const registration of entry.sessions.values()) {
          if (!registration.isReleased) {
            registration.isReleased = true;
            registration.operation = registration.operation.then(
              () => registration.teardown(null),
              () => registration.teardown(null),
            );
          }
          accountSessionReleasePromises.push(
            registration.operation.catch(() => undefined),
          );
        }
      }

      const serviceSessionReleasePromises: Promise<void>[] = [];
      for (const entry of serviceEntries.values()) {
        for (const registration of entry.sessions.values()) {
          if (!registration.isReleased) {
            registration.isReleased = true;
            registration.operation = registration.operation.then(
              () => registration.teardown(null),
              () => registration.teardown(null),
            );
          }
          serviceSessionReleasePromises.push(
            registration.operation.catch(() => undefined),
          );
        }
      }

      // Dispatch every explicit acquisition release before closing its owning
      // root. Closing the root immediately afterwards is also the failure path:
      // it rejects any release RPC whose SharedWorker disappeared instead of
      // leaving Config teardown waiting forever on a dead MessagePort.
      const accountReplicaReleasePromises = Array.from(
        accountEntries.values(),
        async entry => {
          const encodedRelease = await entry.acquiredApi.release();
          await Effect.runPromise(decodeRpc(encodedRelease));
        },
      );
      const serviceReplicaReleasePromises = Array.from(
        serviceEntries.values(),
        async entry => {
          const encodedRelease = await entry.acquiredApi.release();
          await Effect.runPromise(decodeRpc(encodedRelease));
        },
      );

      for (const root of openedWorkerRoots.values()) {
        zerospinDevtoolsStore
          .getState()
          .removeSharedWorkerRootDiagnostics(root.id);
      }
      const rootReleasePromises: Promise<void>[] = [];
      for (const rootRelease of workerRootReleases.values()) {
        rootReleasePromises.push(Effect.runPromise(rootRelease));
      }
      workerRoots.clear();
      openedWorkerRoots.clear();
      workerRootReleases.clear();
      store.setState({ workerRootCount: 0 });
      await Promise.allSettled([
        ...accountSessionReleasePromises,
        ...serviceSessionReleasePromises,
        ...accountReplicaReleasePromises,
        ...serviceReplicaReleasePromises,
        ...rootReleasePromises,
      ]);
      for (const entry of accountEntries.values()) {
        entry.sessions.clear();
      }
      for (const entry of serviceEntries.values()) {
        entry.sessions.clear();
      }
      accountEntries.clear();
      serviceEntries.clear();
      accountAcquisitionOperations.clear();
      serviceAcquisitionOperations.clear();
    },
  };

  return controller;
}

export const BrowserPartitionControllerContext =
  createContext<IBrowserPartitionController | null>(null);
