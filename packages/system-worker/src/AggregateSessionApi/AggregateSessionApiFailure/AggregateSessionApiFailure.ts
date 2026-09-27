import type { IAnyError, IZerospinErrorJson } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import type { AggregateSessionApi } from '../AggregateSessionApi.js';

import { createWebSocketTicket } from './createWebSocketTicket/createWebSocketTicket.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { getActorCommands } from './getActorCommands/getActorCommands.js';
import { getSnapshot } from './getSnapshot/getSnapshot.js';

export class AggregateSessionApiFailure extends RpcTarget {
  /*
   * AggregateSessionApiFailure.constructor answers a rejected capability with its retained admission error.
   *
   * 1. Initialize and bind the instance.
   */
  constructor(private readonly error: IAnyError | IZerospinErrorJson) {
    // 1 — construct the base and retain the supplied capability state
    super();
  }

  /*
   * AggregateSessionApiFailure.getSnapshot answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getSnapshot(
    request: Parameters<AggregateSessionApi['getSnapshot']>[0],
  ): ReturnType<AggregateSessionApi['getSnapshot']> {
    // 1 — run getSnapshot with the retained admission error
    return Effect.runPromise(getSnapshot({ request, error: this.error }));
  }

  /*
   * AggregateSessionApiFailure.createWebSocketTicket answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async createWebSocketTicket(
    request: Parameters<AggregateSessionApi['createWebSocketTicket']>[0],
  ): ReturnType<AggregateSessionApi['createWebSocketTicket']> {
    // 1 — run createWebSocketTicket with the retained admission error
    return Effect.runPromise(
      createWebSocketTicket({ request, error: this.error }),
    );
  }

  /*
   * AggregateSessionApiFailure.getActorCommands answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getActorCommands(
    request: Parameters<AggregateSessionApi['getActorCommands']>[0],
  ): ReturnType<AggregateSessionApi['getActorCommands']> {
    // 1 — run getActorCommands with the retained admission error
    return Effect.runPromise(getActorCommands({ request, error: this.error }));
  }

  /*
   * AggregateSessionApiFailure.executeServiceQuery answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async executeServiceQuery(
    request: Parameters<AggregateSessionApi['executeServiceQuery']>[0],
  ): ReturnType<AggregateSessionApi['executeServiceQuery']> {
    // 1 — run executeServiceQuery with the retained admission error
    return Effect.runPromise(
      executeServiceQuery({ request, error: this.error }),
    );
  }
}
