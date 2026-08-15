import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';
import { BrandTypeId } from 'effect/Brand';

import type { AggregateFrontendApi } from '../AggregateFrontendApi.js';

import { createWebSocketTicket } from './createWebSocketTicket/createWebSocketTicket.js';
import { executeAggregateQuery } from './executeAggregateQuery/executeAggregateQuery.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { getAdmission } from './getAdmission/getAdmission.js';
import { getState } from './getState/getState.js';
import { pushCommands } from './pushCommands/pushCommands.js';

export class AggregateFrontendApiFailure extends RpcTarget {
  declare [BrandTypeId]: 'TargetApi';

  constructor(private readonly error: IAnyError) {
    super();
  }

  async getAdmission(): ReturnType<AggregateFrontendApi['getAdmission']> {
    return Effect.runPromise(getAdmission({ error: this.error }));
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

  async pushCommands(
    request: Parameters<AggregateFrontendApi['pushCommands']>[0],
  ): ReturnType<AggregateFrontendApi['pushCommands']> {
    return Effect.runPromise(pushCommands({ request, error: this.error }));
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
