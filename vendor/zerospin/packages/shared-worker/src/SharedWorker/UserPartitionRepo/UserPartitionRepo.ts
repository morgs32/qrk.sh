import type { Async } from '@zerospin/core/async/Async';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import type { ISystemId } from '@zerospin/core/system/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { type IAnyError } from '@zerospin/error';
import type { authenticate } from '@zerospin/frontend/authenticate';
import type { TelemetryCollector } from '@zerospin/logger';
import { RpcTarget } from 'capnweb';
import { Effect, type ManagedRuntime } from 'effect';

import type { UserPartitionRepo as IUserPartitionRepo } from '../../acquireUserPartitionRepo.ts';
import { type makeIdbSQLite3 } from '../../drizzle/makeIdbSQLite3.ts';
import type { IAsyncWaSqliteDrizzleDb } from '../../drizzle/types.ts';
import { type AggregateFrontendReplicaRepo } from '../AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts';
import { type ServiceFrontendReplicaRepo } from '../ServiceFrontendReplicaRepo/ServiceFrontendReplicaRepo.ts';
import { type userReplicaDbConfig } from '../userReplicaSchemas.ts';

import { acquireAggregateFrontendReplica } from './acquireAggregateFrontendReplica/acquireAggregateFrontendReplica.ts';
import { acquireServiceFrontendReplica } from './acquireServiceFrontendReplica/acquireServiceFrontendReplica.ts';
import { getPushPaused } from './getPushPaused/getPushPaused.ts';
import { listAggregateFrontendReplicas } from './listAggregateFrontendReplicas/listAggregateFrontendReplicas.ts';
import { listServiceFrontendReplicas } from './listServiceFrontendReplicas/listServiceFrontendReplicas.ts';
import { pushNow } from './pushNow/pushNow.ts';
import { setPushPaused } from './setPushPaused/setPushPaused.ts';
import { stageAggregateFrontendCommand } from './stageAggregateFrontendCommand/stageAggregateFrontendCommand.ts';

export class UserPartitionRepo extends RpcTarget implements IUserPartitionRepo {
  constructor(
    private readonly props: {
      userId: string;
      ownerToken: object;
      runtime: ManagedRuntime.ManagedRuntime<
        CuidFactory | MonotonicFactory,
        IAnyError
      >;
      authenticationRuntime: ManagedRuntime.ManagedRuntime<
        Async | PublishableKey | TelemetryCollector | ZerospinApiUrl,
        IAnyError
      >;
      systemId: ISystemId;
      systemName: string;
      sharedWorkerWasmUrl: string;
      sharedWorkerApiUrl: string;
      portState: { terminalError: IAnyError | null };
      userReplicaStores: Map<
        string,
        {
          userId: string;
          userReplicaSqlite: Awaited<ReturnType<typeof makeIdbSQLite3>>;
          db: IAsyncWaSqliteDrizzleDb<typeof userReplicaDbConfig>;
          systemId: string;
          vfsName: string;
          acquisitionTail: Promise<void>;
        }
      >;
      aggregateReplicaRuntimes: Map<string, AggregateFrontendReplicaRepo>;
      serviceReplicaRuntimes: Map<string, ServiceFrontendReplicaRepo>;
      allocateRegistrationId: () => number;
      getAuthenticatedApi(props: {
        freshness: 'current' | 'refresh-if-current' | 'force';
        failedAuthenticatedApi:
          | Effect.Effect.Success<
              ReturnType<typeof authenticate>
            >['authenticatedApi']
          | null;
      }): Promise<Effect.Effect.Success<ReturnType<typeof authenticate>>>;
      getCurrentAuthenticatedApi():
        | Effect.Effect.Success<
            ReturnType<typeof authenticate>
          >['authenticatedApi']
        | null;
    },
  ) {
    super();
  }

  async acquireAggregateFrontendReplica(
    props: Parameters<IUserPartitionRepo['acquireAggregateFrontendReplica']>[0],
  ): ReturnType<IUserPartitionRepo['acquireAggregateFrontendReplica']> {
    return this.props.runtime.runPromise(
      (this.props.portState.terminalError === null
        ? acquireAggregateFrontendReplica({
            request: props,
            runtime: this.props.runtime,
            authenticationRuntime: this.props.authenticationRuntime,
            userReplicaStores: this.props.userReplicaStores,
            systemId: this.props.systemId,
            userId: this.props.userId,
            systemName: this.props.systemName,
            aggregateReplicaRuntimes: this.props.aggregateReplicaRuntimes,
            sharedWorkerWasmUrl: this.props.sharedWorkerWasmUrl,
            ownerToken: this.props.ownerToken,
            sharedWorkerApiUrl: this.props.sharedWorkerApiUrl,
            allocateRegistrationId: this.props.allocateRegistrationId,
            getAuthenticatedApi: this.props.getAuthenticatedApi,
            getCurrentAuthenticatedApi: this.props.getCurrentAuthenticatedApi,
          })
        : Effect.fail(this.props.portState.terminalError)
      ).pipe(encodeRpc),
    );
  }

  async acquireServiceFrontendReplica(
    props: Parameters<IUserPartitionRepo['acquireServiceFrontendReplica']>[0],
  ): ReturnType<IUserPartitionRepo['acquireServiceFrontendReplica']> {
    return this.props.runtime.runPromise(
      (this.props.portState.terminalError === null
        ? acquireServiceFrontendReplica({
            request: props,
            runtime: this.props.runtime,
            authenticationRuntime: this.props.authenticationRuntime,
            userReplicaStores: this.props.userReplicaStores,
            systemId: this.props.systemId,
            userId: this.props.userId,
            systemName: this.props.systemName,
            serviceReplicaRuntimes: this.props.serviceReplicaRuntimes,
            sharedWorkerWasmUrl: this.props.sharedWorkerWasmUrl,
            ownerToken: this.props.ownerToken,
            sharedWorkerApiUrl: this.props.sharedWorkerApiUrl,
            allocateRegistrationId: this.props.allocateRegistrationId,
            getAuthenticatedApi: this.props.getAuthenticatedApi,
            getCurrentAuthenticatedApi: this.props.getCurrentAuthenticatedApi,
          })
        : Effect.fail(this.props.portState.terminalError)
      ).pipe(encodeRpc),
    );
  }

  async stageAggregateFrontendCommand(
    props: Parameters<IUserPartitionRepo['stageAggregateFrontendCommand']>[0],
  ): ReturnType<IUserPartitionRepo['stageAggregateFrontendCommand']> {
    return this.props.runtime.runPromise(
      (this.props.portState.terminalError === null
        ? stageAggregateFrontendCommand({
            request: props,
            userReplicaStores: this.props.userReplicaStores,
            systemId: this.props.systemId,
            userId: this.props.userId,
            aggregateReplicaRuntimes: this.props.aggregateReplicaRuntimes,
            ownerToken: this.props.ownerToken,
          })
        : Effect.fail(this.props.portState.terminalError)
      ).pipe(encodeRpc),
    );
  }

  async getPushPaused(
    props: Parameters<IUserPartitionRepo['getPushPaused']>[0],
  ): ReturnType<IUserPartitionRepo['getPushPaused']> {
    return this.props.runtime.runPromise(
      (this.props.portState.terminalError === null
        ? getPushPaused({
            request: props,
            systemId: this.props.systemId,
            userId: this.props.userId,
            aggregateReplicaRuntimes: this.props.aggregateReplicaRuntimes,
          })
        : Effect.fail(this.props.portState.terminalError)
      ).pipe(encodeRpc),
    );
  }

  async setPushPaused(
    props: Parameters<IUserPartitionRepo['setPushPaused']>[0],
  ): ReturnType<IUserPartitionRepo['setPushPaused']> {
    return this.props.runtime.runPromise(
      (this.props.portState.terminalError === null
        ? setPushPaused({
            request: props,
            systemId: this.props.systemId,
            userId: this.props.userId,
            aggregateReplicaRuntimes: this.props.aggregateReplicaRuntimes,
          })
        : Effect.fail(this.props.portState.terminalError)
      ).pipe(encodeRpc),
    );
  }

  async pushNow(
    props: Parameters<IUserPartitionRepo['pushNow']>[0],
  ): ReturnType<IUserPartitionRepo['pushNow']> {
    return this.props.runtime.runPromise(
      (this.props.portState.terminalError === null
        ? pushNow({
            request: props,
            systemId: this.props.systemId,
            userId: this.props.userId,
            aggregateReplicaRuntimes: this.props.aggregateReplicaRuntimes,
          })
        : Effect.fail(this.props.portState.terminalError)
      ).pipe(encodeRpc),
    );
  }

  async listAggregateFrontendReplicas(): ReturnType<
    IUserPartitionRepo['listAggregateFrontendReplicas']
  > {
    return this.props.runtime.runPromise(
      (this.props.portState.terminalError === null
        ? listAggregateFrontendReplicas({
            userReplicaStores: this.props.userReplicaStores,
            systemId: this.props.systemId,
            userId: this.props.userId,
            aggregateReplicaRuntimes: this.props.aggregateReplicaRuntimes,
          })
        : Effect.fail(this.props.portState.terminalError)
      ).pipe(encodeRpc),
    );
  }

  async listServiceFrontendReplicas(): ReturnType<
    IUserPartitionRepo['listServiceFrontendReplicas']
  > {
    return this.props.runtime.runPromise(
      (this.props.portState.terminalError === null
        ? listServiceFrontendReplicas({
            userReplicaStores: this.props.userReplicaStores,
            systemId: this.props.systemId,
            userId: this.props.userId,
            serviceReplicaRuntimes: this.props.serviceReplicaRuntimes,
          })
        : Effect.fail(this.props.portState.terminalError)
      ).pipe(encodeRpc),
    );
  }
}
