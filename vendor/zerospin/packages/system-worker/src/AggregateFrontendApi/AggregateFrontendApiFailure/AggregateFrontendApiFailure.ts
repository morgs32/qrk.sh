import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import type { AggregateFrontendApi } from '../AggregateFrontendApi.js';

import { createWebSocketTicket } from './createWebSocketTicket/createWebSocketTicket.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { getSelectedCommands } from './getSelectedCommands/getSelectedCommands.js';
import { getSnapshot } from './getSnapshot/getSnapshot.js';

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
   * AggregateFrontendApiFailure.getSnapshot answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getSnapshot(
    request: Parameters<AggregateFrontendApi['getSnapshot']>[0],
  ): ReturnType<AggregateFrontendApi['getSnapshot']> {
    // 1 — run getSnapshot with the retained admission error
    return Effect.runPromise(getSnapshot({ request, error: this.error }));
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
   * AggregateFrontendApiFailure.getSelectedCommands answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getSelectedCommands(
    request: Parameters<AggregateFrontendApi['getSelectedCommands']>[0],
  ): ReturnType<AggregateFrontendApi['getSelectedCommands']> {
    // 1 — run getSelectedCommands with the retained admission error
    return Effect.runPromise(
      getSelectedCommands({ request, error: this.error }),
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
