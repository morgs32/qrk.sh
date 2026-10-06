import type { IAnyError, IZerospinErrorJson } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import type { AggregateSessionApi } from '../AggregateSessionApi.js';

import { createWebSocketTicket } from './createWebSocketTicket/createWebSocketTicket.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { getBrowserCommands } from './getBrowserCommands/getBrowserCommands.js';
import { getSnapshot } from './getSnapshot/getSnapshot.js';
import { validateActorCommand } from './validateActorCommand/validateActorCommand.js';

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

  async validateActorCommand(
    request: Parameters<AggregateSessionApi['validateActorCommand']>[0],
  ): ReturnType<AggregateSessionApi['validateActorCommand']> {
    return Effect.runPromise(
      validateActorCommand({ request, error: this.error }),
    );
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
   * AggregateSessionApiFailure.getBrowserCommands answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getBrowserCommands(
    request: Parameters<AggregateSessionApi['getBrowserCommands']>[0],
  ): ReturnType<AggregateSessionApi['getBrowserCommands']> {
    // 1 — run getBrowserCommands with the retained admission error
    return Effect.runPromise(
      getBrowserCommands({ request, error: this.error }),
    );
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
