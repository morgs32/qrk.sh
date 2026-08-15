import type { Async } from '@zerospin/core/async/Async';
import type { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import type { ISystemId } from '@zerospin/core/system/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import type { authenticate } from '@zerospin/frontend/authenticate';
import type { TelemetryCollector } from '@zerospin/logger';
import { RpcTarget, type RpcStub } from 'capnweb';
import type { Effect, ManagedRuntime, Schema } from 'effect';

import type { makeIdbSQLite3 } from '../../drizzle/makeIdbSQLite3.ts';
import type { IAsyncWaSqliteDrizzleDb } from '../../drizzle/types.ts';
import type { AggregateFrontendReplicaRepo } from '../AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts';
import type { ServiceFrontendReplicaRepo } from '../ServiceFrontendReplicaRepo/ServiceFrontendReplicaRepo.ts';
import type { userReplicaDbConfig } from '../userReplicaSchemas.ts';

import { dispose } from './dispose/dispose.ts';
import { getUserPartitionRepo } from './getUserPartitionRepo/getUserPartitionRepo.ts';

export class SharedWorkerApi extends RpcTarget {
  private readonly authenticationState: {
    configuration: null | {
      systemName: string;
      authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
      generateSignature:
        | RpcStub<() => Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>>>
        | (() => Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>>);
    };
    boundIdentity: null | {
      systemId: ISystemId;
      userId: string;
      systemName: string;
    };
    current: null | Effect.Effect.Success<ReturnType<typeof authenticate>>;
    pending: null | {
      token: object;
      promise: Promise<Effect.Effect.Success<ReturnType<typeof authenticate>>>;
      failureSource: null | 'authentication' | 'callback' | 'capability';
    };
    lastFailure: null | {
      token: object;
      error: IAnyError;
      source: 'authentication' | 'callback' | 'capability';
    };
    terminalError: IAnyError | null;
  } = {
    configuration: null,
    boundIdentity: null,
    current: null,
    pending: null,
    lastFailure: null,
    terminalError: null,
  };

  constructor(
    private readonly props: {
      ownerToken: object;
      runtime: ManagedRuntime.ManagedRuntime<
        CuidFactory | MonotonicFactory,
        IAnyError
      >;
      authenticationRuntime: ManagedRuntime.ManagedRuntime<
        Async | PublishableKey | TelemetryCollector | ZerospinApiUrl,
        IAnyError
      >;
      sharedWorkerWasmUrl: string;
      sharedWorkerApiUrl: string;
      sharedWorkerPublishableKey: string;
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
      userReplicaOpenPromises: Map<
        string,
        Promise<{
          userId: string;
          userReplicaSqlite: Awaited<ReturnType<typeof makeIdbSQLite3>>;
          db: IAsyncWaSqliteDrizzleDb<typeof userReplicaDbConfig>;
          systemId: string;
          vfsName: string;
          acquisitionTail: Promise<void>;
        }>
      >;
      aggregateReplicaRuntimes: Map<string, AggregateFrontendReplicaRepo>;
      serviceReplicaRuntimes: Map<string, ServiceFrontendReplicaRepo>;
      allocateRegistrationId: () => number;
    },
  ) {
    super();
  }

  async getUserPartitionRepo(request: {
    systemName: string;
    authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
    generateSignature(): Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>>;
  }) {
    return this.props.runtime.runPromise(
      getUserPartitionRepo({
        ...this.props,
        request,
        authenticationState: this.authenticationState,
      }).pipe(encodeRpc),
    );
  }

  [Symbol.dispose](): void {
    this.props.runtime.runSync(
      dispose({
        ...this.props,
        authenticationState: this.authenticationState,
        terminalError: new ZerospinError({
          code: 'shared-worker-port-released',
          message: 'The SharedWorker port was released',
        }),
      }),
    );
  }
}
