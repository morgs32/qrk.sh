import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import type { AggregateFrontendApi } from '../AggregateFrontendApi.js';

import { createWebSocketTicket } from './createWebSocketTicket/createWebSocketTicket.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { getFinalizedCommands } from './getFinalizedCommands/getFinalizedCommands.js';
import { getState } from './getState/getState.js';
import { pushCommand } from './pushCommand/pushCommand.js';

export class AggregateFrontendApiFailure extends RpcTarget {
  /*
   * AggregateFrontendApiFailure.constructor answers a rejected capability with its retained admission error.
   *
   * 1. Initialize and bind the instance.
   */
  constructor(private readonly error: IAnyError) {
    // 1 — construct the base and retain the supplied capability state
    super();
  }

  /*
   * AggregateFrontendApiFailure.getState answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getState(
    request: Parameters<AggregateFrontendApi['getState']>[0],
  ): ReturnType<AggregateFrontendApi['getState']> {
    // 1 — run getState with the retained admission error
    return Effect.runPromise(getState({ request, error: this.error }));
  }

  /*
   * AggregateFrontendApiFailure.createWebSocketTicket answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async createWebSocketTicket(
    request: Parameters<AggregateFrontendApi['createWebSocketTicket']>[0],
  ): ReturnType<AggregateFrontendApi['createWebSocketTicket']> {
    // 1 — run createWebSocketTicket with the retained admission error
    return Effect.runPromise(
      createWebSocketTicket({ request, error: this.error }),
    );
  }

  /*
   * AggregateFrontendApiFailure.pushCommand answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async pushCommand(
    request: Parameters<AggregateFrontendApi['pushCommand']>[0],
  ): ReturnType<AggregateFrontendApi['pushCommand']> {
    // 1 — run pushCommand with the retained admission error
    return Effect.runPromise(pushCommand({ request, error: this.error }));
  }

  /*
   * AggregateFrontendApiFailure.getFinalizedCommands answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getFinalizedCommands(
    request: Parameters<AggregateFrontendApi['getFinalizedCommands']>[0],
  ): ReturnType<AggregateFrontendApi['getFinalizedCommands']> {
    // 1 — run getFinalizedCommands with the retained admission error
    return Effect.runPromise(
      getFinalizedCommands({ request, error: this.error }),
    );
  }

  /*
   * AggregateFrontendApiFailure.executeServiceQuery answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async executeServiceQuery(
    request: Parameters<AggregateFrontendApi['executeServiceQuery']>[0],
  ): ReturnType<AggregateFrontendApi['executeServiceQuery']> {
    // 1 — run executeServiceQuery with the retained admission error
    return Effect.runPromise(
      executeServiceQuery({ request, error: this.error }),
    );
  }
}
