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
import type { IAnyErrorJson } from '@zerospin/error';
import type { Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import type {
  AccountFrontendReplicaProviderApi,
  PartitionApi,
  ServiceFrontendReplicaProviderApi,
} from './makeSharedWorkerSession.ts';

type IExpectedAccountFrontendReplicaProviderApi = IRpcTarget<{
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

type IExpectedServiceFrontendReplicaProviderApi = IRpcTarget<{
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

type IExpectedAccountAcquiredApi = IRpcTarget<{
  getFrontendState(): Promise<
    Schema.EitherEncoded<IFrontendReplicaState, IAnyErrorJson>
  >;
  release(): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
}>;

type IExpectedServiceAcquiredApi = IRpcTarget<{
  getFrontendState(): Promise<
    Schema.EitherEncoded<IServiceFrontendReplicaState, IAnyErrorJson>
  >;
  release(): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
}>;

type IExpectedPartitionApi = IRpcTarget<{
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
  }): Promise<Schema.EitherEncoded<IExpectedAccountAcquiredApi, IAnyErrorJson>>;
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
  }): Promise<Schema.EitherEncoded<IExpectedServiceAcquiredApi, IAnyErrorJson>>;
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

type IAccountAcquiredApi =
  Awaited<
    ReturnType<PartitionApi['acquireFrontendReplica']>
  > extends Schema.EitherEncoded<infer SUCCESS, IAnyErrorJson>
    ? SUCCESS
    : never;

type IServiceAcquiredApi =
  Awaited<
    ReturnType<PartitionApi['acquireServiceFrontendReplica']>
  > extends Schema.EitherEncoded<infer SUCCESS, IAnyErrorJson>
    ? SUCCESS
    : never;

assert<
  Equals<
    AccountFrontendReplicaProviderApi,
    IExpectedAccountFrontendReplicaProviderApi
  >
>();
assert<
  Equals<
    ServiceFrontendReplicaProviderApi,
    IExpectedServiceFrontendReplicaProviderApi
  >
>();
assert<Equals<PartitionApi, IExpectedPartitionApi>>();
assert<Equals<IAccountAcquiredApi, IExpectedAccountAcquiredApi>>();
assert<Equals<IServiceAcquiredApi, IExpectedServiceAcquiredApi>>();
assert<Equals<keyof IAccountAcquiredApi, 'getFrontendState' | 'release'>>();
assert<Equals<keyof IServiceAcquiredApi, 'getFrontendState' | 'release'>>();

declare const serviceProvider: ServiceFrontendReplicaProviderApi;
declare const serviceAcquiredApi: IServiceAcquiredApi;

// @ts-expect-error Service providers never receive an account push capability.
void serviceProvider.pushCommands;
// @ts-expect-error Service providers never receive account command callbacks.
void serviceProvider.handleFrontendReplicaBlock;
// @ts-expect-error Acquired service replicas expose only state and release.
void serviceAcquiredApi.pushCommands;
// @ts-expect-error Acquired service replicas expose no query surface.
void serviceAcquiredApi.query;
