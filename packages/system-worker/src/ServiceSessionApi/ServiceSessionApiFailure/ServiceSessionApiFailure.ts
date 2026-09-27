import { type IAnyError, type IZerospinErrorJson } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import type { ServiceSessionApi } from '../ServiceSessionApi.js';

import { createWebSocketTicket } from './createWebSocketTicket/createWebSocketTicket.js';
import { getActorCommands } from './getActorCommands/getActorCommands.js';
import { getSnapshot } from './getSnapshot/getSnapshot.js';

export class ServiceSessionApiFailure extends RpcTarget {
  /*
   * ServiceSessionApiFailure.constructor answers a rejected capability with its retained admission error.
   *
   * 1. Initialize and bind the instance.
   */
  constructor(private readonly error: IAnyError | IZerospinErrorJson) {
    // 1 — construct the base and retain the supplied capability state
    super();
  }

  /*
   * ServiceSessionApiFailure.getSnapshot answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getSnapshot(
    request: Parameters<ServiceSessionApi['getSnapshot']>[0],
  ): ReturnType<ServiceSessionApi['getSnapshot']> {
    // 1 — run getSnapshot with the retained admission error
    return Effect.runPromise(getSnapshot({ request, error: this.error }));
  }

  /*
   * ServiceSessionApiFailure.getActorCommands answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getActorCommands(
    request: Parameters<ServiceSessionApi['getActorCommands']>[0],
  ): ReturnType<ServiceSessionApi['getActorCommands']> {
    // 1 — run getActorCommands with the retained admission error
    return Effect.runPromise(getActorCommands({ request, error: this.error }));
  }

  /*
   * ServiceSessionApiFailure.createWebSocketTicket answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async createWebSocketTicket(
    request: Parameters<ServiceSessionApi['createWebSocketTicket']>[0],
  ): ReturnType<ServiceSessionApi['createWebSocketTicket']> {
    // 1 — run createWebSocketTicket with the retained admission error
    return Effect.runPromise(
      createWebSocketTicket({ request, error: this.error }),
    );
  }
}
