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
import type {
  IServiceFrontendReplicaBlock,
  IServiceFrontendReplicaState,
} from '@zerospin/core/serviceSession/types';
import type {
  IAggregateFrontendReplicaBlock,
  IAggregateFrontendReplicaState,
} from '@zerospin/core/session/types';
import type { ISystemId } from '@zerospin/core/system/types';
import type { IRpcTarget } from '@zerospin/core/utils/types';
import type { IAnyErrorJson } from '@zerospin/error';
import type { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import type {
  acquireUserPartitionRepo,
  AggregateFrontendReplicaSinkApi,
  ServiceFrontendReplicaSinkApi,
  UserPartitionRepo,
} from './acquireUserPartitionRepo.ts';

assert<
  Equals<
    Parameters<typeof acquireUserPartitionRepo>[0],
    {
      systemName: string;
      authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
      generateSignature(): Promise<
        Schema.EitherEncoded<unknown, IAnyErrorJson>
      >;
    }
  >
>();
assert<
  Equals<
    Effect.Effect.Success<ReturnType<typeof acquireUserPartitionRepo>>,
    {
      api: UserPartitionRepo;
      release: Effect.Effect<void>;
      systemId: ISystemId;
      userId: string;
      mode: 'online' | 'existing-only';
    }
  >
>();

type IExpectedAggregateFrontendReplicaSinkApi = IRpcTarget<{
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

type IExpectedServiceFrontendReplicaSinkApi = IRpcTarget<{
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

type IExpectedAggregateAcquiredApi = IRpcTarget<{
  getState(): Promise<
    Schema.EitherEncoded<IAggregateFrontendReplicaState, IAnyErrorJson>
  >;
  release(): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
}>;

type IExpectedServiceAcquiredApi = IRpcTarget<{
  getState(): Promise<
    Schema.EitherEncoded<IServiceFrontendReplicaState, IAnyErrorJson>
  >;
  release(): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
}>;

type IExpectedUserPartitionRepo = IRpcTarget<{
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
    Schema.EitherEncoded<IExpectedAggregateAcquiredApi, IAnyErrorJson>
  >;
  acquireServiceFrontendReplica(props: {
    serviceName: string;
    frontendName: string;
    serviceFrontendLockKey: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
    frontendSpec: IFrontendControllerSpec;
    mode: 'online' | 'existing-only';
    sink: ServiceFrontendReplicaSinkApi;
  }): Promise<Schema.EitherEncoded<IExpectedServiceAcquiredApi, IAnyErrorJson>>;
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
      | Readonly<{
          status: 'retry-exhausted';
          failure: IAnyErrorJson;
        }>,
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

type IAggregateAcquiredApi =
  Awaited<
    ReturnType<UserPartitionRepo['acquireAggregateFrontendReplica']>
  > extends Schema.EitherEncoded<infer SUCCESS, IAnyErrorJson>
    ? SUCCESS
    : never;

type IServiceAcquiredApi =
  Awaited<
    ReturnType<UserPartitionRepo['acquireServiceFrontendReplica']>
  > extends Schema.EitherEncoded<infer SUCCESS, IAnyErrorJson>
    ? SUCCESS
    : never;

assert<
  Equals<
    AggregateFrontendReplicaSinkApi,
    IExpectedAggregateFrontendReplicaSinkApi
  >
>();
assert<
  Equals<ServiceFrontendReplicaSinkApi, IExpectedServiceFrontendReplicaSinkApi>
>();
assert<Equals<UserPartitionRepo, IExpectedUserPartitionRepo>>();
assert<Equals<IAggregateAcquiredApi, IExpectedAggregateAcquiredApi>>();
assert<Equals<IServiceAcquiredApi, IExpectedServiceAcquiredApi>>();
assert<Equals<keyof IAggregateAcquiredApi, 'getState' | 'release'>>();
assert<Equals<keyof IServiceAcquiredApi, 'getState' | 'release'>>();

declare const serviceSink: ServiceFrontendReplicaSinkApi;
declare const serviceAcquiredApi: IServiceAcquiredApi;

// @ts-expect-error Service sinks never receive an aggregate push capability.
void serviceSink.pushCommands;
// @ts-expect-error Service sinks never receive aggregate command callbacks.
void serviceSink.handleBlock;
// @ts-expect-error Acquired service replicas expose only state and release.
void serviceAcquiredApi.pushCommands;
// @ts-expect-error Acquired service replicas expose no query surface.
void serviceAcquiredApi.query;
