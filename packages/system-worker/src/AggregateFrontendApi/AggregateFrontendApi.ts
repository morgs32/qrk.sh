import type {
  IChainedCommand,
  IEncodedCommand,
  ISessionCommand,
} from '@zerospin/core/contracts/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import type {
  IAggregateFrontendFinalizedCommand,
  IAggregateFrontendPushedCommand,
  IAggregateFrontendSyncState,
  IFrontendDelta,
} from '@zerospin/core/session/types';
import type { ISystemId } from '@zerospin/core/system/types';
import type { IAnyErrorJson } from '@zerospin/error';
import type { ILinkedRpcEnvelope, IRpcRequest } from '@zerospin/logger';
import { RpcTarget } from 'capnweb';
import type { Schema } from 'effect';

import type { ISystemRuntime } from '../makeSystemRuntime.js';

import { createWebSocketTicket } from './createWebSocketTicket/createWebSocketTicket.js';
import { executeAggregateQuery } from './executeAggregateQuery/executeAggregateQuery.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { getFinalizedCommands } from './getFinalizedCommands/getFinalizedCommands.js';
import { getPushedCommands } from './getPushedCommands/getPushedCommands.js';
import { getState } from './getState/getState.js';
import { pushCommand } from './pushCommand/pushCommand.js';

export class AggregateFrontendApi extends RpcTarget {
  readonly #authResults: {
    readonly aggregateId: IAggregateId;
    readonly aggregateName: string;
    readonly userId: string;
    readonly frontendName: string;
    readonly aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
    readonly systemId: ISystemId;
  };
  readonly #runtime: ISystemRuntime;

  constructor(props: {
    authResults: {
      readonly aggregateId: IAggregateId;
      readonly aggregateName: string;
      readonly userId: string;
      readonly frontendName: string;
      readonly aggregateFrontendLock: Schema.Schema.Type<
        typeof AggregateFrontendLockSchema
      >;
      readonly systemId: ISystemId;
    };
    runtime: ISystemRuntime;
  }) {
    super();
    this.#authResults = props.authResults;
    this.#runtime = props.runtime;
  }

  async pushCommand(
    request: IRpcRequest<
      [
        {
          readonly command: IEncodedCommand<
            IChainedCommand<ISessionCommand, IFrontendDelta> &
              Readonly<{ sessionIndex: number; pushIndex: null }>
          >;
        },
      ]
    >,
  ): Promise<
    ILinkedRpcEnvelope<
      IEncodedCommand<IAggregateFrontendPushedCommand>,
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      pushCommand({ request, authResults: this.#authResults }),
    );
  }

  async getFinalizedCommands(
    request: IRpcRequest<[{ afterFrontendIndex: number }]>,
  ): Promise<
    ILinkedRpcEnvelope<
      Readonly<{
        commands: readonly IEncodedCommand<IAggregateFrontendFinalizedCommand>[];
        tip: number;
      }>,
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      getFinalizedCommands({ request, authResults: this.#authResults }),
    );
  }

  async getPushedCommands(
    request: IRpcRequest<[{ afterPushIndex: number }]>,
  ): Promise<
    ILinkedRpcEnvelope<
      Readonly<{
        commands: readonly IEncodedCommand<IAggregateFrontendPushedCommand>[];
        tip: number;
      }>,
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      getPushedCommands({ request, authResults: this.#authResults }),
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
