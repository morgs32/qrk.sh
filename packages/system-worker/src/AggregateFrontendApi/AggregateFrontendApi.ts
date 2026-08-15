import type { IUserRef } from '@zerospin/core/aggregate/types';
import type {
  IEncodedCommand,
  IPushBlock,
  IStagedReplicaCommand,
} from '@zerospin/core/contracts/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import type { IAggregateFrontendSyncState } from '@zerospin/core/session/types';
import type { ISystemId } from '@zerospin/core/system/types';
import type { IAnyErrorJson } from '@zerospin/error';
import type { ILinkedRpcEnvelope, IRpcRequest } from '@zerospin/logger';
import { RpcTarget } from 'capnweb';
import type { Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';

import type { ISystemRuntime } from '../makeSystemRuntime.js';

import { createWebSocketTicket } from './createWebSocketTicket/createWebSocketTicket.js';
import { executeAggregateQuery } from './executeAggregateQuery/executeAggregateQuery.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { getAdmission } from './getAdmission/getAdmission.js';
import { getState } from './getState/getState.js';
import { pushCommands } from './pushCommands/pushCommands.js';

export class AggregateFrontendApi extends RpcTarget {
  declare [BrandTypeId]: 'TargetApi';

  readonly #authResults: {
    readonly actorRef: IUserRef;
    readonly frontendName: string;
    readonly aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
    readonly generationId: string;
    readonly frontendSpec: IFrontendControllerSpec;
    readonly systemId: ISystemId;
    readonly systemVersion: string;
    readonly systemWorkerName: string;
  };
  readonly #runtime: ISystemRuntime;

  constructor(props: {
    authResults: {
      readonly actorRef: IUserRef;
      readonly frontendName: string;
      readonly aggregateFrontendLock: Schema.Schema.Type<
        typeof AggregateFrontendLockSchema
      >;
      readonly generationId: string;
      readonly frontendSpec: IFrontendControllerSpec;
      readonly systemId: ISystemId;
      readonly systemVersion: string;
      readonly systemWorkerName: string;
    };
    runtime: ISystemRuntime;
  }) {
    super();
    this.#authResults = props.authResults;
    this.#runtime = props.runtime;
  }

  async getAdmission(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        actorRef: IUserRef;
        aggregateFrontendLock: Schema.Schema.Type<
          typeof AggregateFrontendLockSchema
        >;
        frontendName: string;
        frontendSpec: IFrontendControllerSpec;
        systemId: ISystemId;
        systemVersion: string;
      }>,
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      getAdmission({ admission: this.#authResults }),
    );
  }

  async pushCommands(
    request: IRpcRequest<
      [{ readonly commands: readonly IEncodedCommand<IStagedReplicaCommand>[] }]
    >,
  ): Promise<ILinkedRpcEnvelope<IPushBlock, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      pushCommands({ request, authResults: this.#authResults }),
    );
  }

  async executeServiceQuery(
    request: IRpcRequest<
      [{ serviceName: string; queryName: string; params: unknown }]
    >,
  ): Promise<ILinkedRpcEnvelope<unknown, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      executeServiceQuery({ request, authResults: this.#authResults }),
    );
  }

  async executeAggregateQuery(
    request: IRpcRequest<[{ queryName: string; params: unknown }]>,
  ): Promise<ILinkedRpcEnvelope<unknown, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      executeAggregateQuery({ request, authResults: this.#authResults }),
    );
  }

  async getState(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<IAggregateFrontendSyncState, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getState({ request, authResults: this.#authResults }),
    );
  }

  async createWebSocketTicket(request: IRpcRequest<[]>): Promise<
    ILinkedRpcEnvelope<
      Readonly<{
        ticket: string;
      }>,
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      createWebSocketTicket({
        request,
        authResults: this.#authResults,
      }),
    );
  }
}
