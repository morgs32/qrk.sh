import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import type { AggregateFrontendApi } from '../AggregateFrontendApi.js';

import { createWebSocketTicket } from './createWebSocketTicket/createWebSocketTicket.js';
import { executeAggregateQuery } from './executeAggregateQuery/executeAggregateQuery.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { getFinalizedCommands } from './getFinalizedCommands/getFinalizedCommands.js';
import { getPushedCommands } from './getPushedCommands/getPushedCommands.js';
import { getState } from './getState/getState.js';
import { pushCommand } from './pushCommand/pushCommand.js';

export class AggregateFrontendApiFailure extends RpcTarget {
  constructor(private readonly error: IAnyError) {
    super();
  }

  async getState(
    request: Parameters<AggregateFrontendApi['getState']>[0],
  ): ReturnType<AggregateFrontendApi['getState']> {
    return Effect.runPromise(getState({ request, error: this.error }));
  }

  async createWebSocketTicket(
    request: Parameters<AggregateFrontendApi['createWebSocketTicket']>[0],
  ): ReturnType<AggregateFrontendApi['createWebSocketTicket']> {
    return Effect.runPromise(
      createWebSocketTicket({ request, error: this.error }),
    );
  }

  async pushCommand(
    request: Parameters<AggregateFrontendApi['pushCommand']>[0],
  ): ReturnType<AggregateFrontendApi['pushCommand']> {
    return Effect.runPromise(pushCommand({ request, error: this.error }));
  }

  async getFinalizedCommands(
    request: Parameters<AggregateFrontendApi['getFinalizedCommands']>[0],
  ): ReturnType<AggregateFrontendApi['getFinalizedCommands']> {
    return Effect.runPromise(
      getFinalizedCommands({ request, error: this.error }),
    );
  }

  async getPushedCommands(
    request: Parameters<AggregateFrontendApi['getPushedCommands']>[0],
  ): ReturnType<AggregateFrontendApi['getPushedCommands']> {
    return Effect.runPromise(
      getPushedCommands({ request, error: this.error }),
    );
  }

  async executeServiceQuery(
    request: Parameters<AggregateFrontendApi['executeServiceQuery']>[0],
  ): ReturnType<AggregateFrontendApi['executeServiceQuery']> {
    return Effect.runPromise(
      executeServiceQuery({ request, error: this.error }),
    );
  }

  async executeAggregateQuery(
    request: Parameters<AggregateFrontendApi['executeAggregateQuery']>[0],
  ): ReturnType<AggregateFrontendApi['executeAggregateQuery']> {
    return Effect.runPromise(
      executeAggregateQuery({ request, error: this.error }),
    );
  }
}
