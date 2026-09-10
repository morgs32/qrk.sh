import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import type { ServiceFrontendApi } from '../ServiceFrontendApi.js';

import { createWebSocketTicket } from './createWebSocketTicket/createWebSocketTicket.js';
import { getFinalizedCommands } from './getFinalizedCommands/getFinalizedCommands.js';
import { getState } from './getState/getState.js';

export class ServiceFrontendApiFailure extends RpcTarget {
  /*
   * ServiceFrontendApiFailure.constructor answers a rejected capability with its retained admission error.
   *
   * 1. Initialize and bind the instance.
   */
  constructor(private readonly error: IAnyError) {
    // 1 — construct the base and retain the supplied capability state
    super();
  }

  /*
   * ServiceFrontendApiFailure.getState answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getState(
    request: Parameters<ServiceFrontendApi['getState']>[0],
  ): ReturnType<ServiceFrontendApi['getState']> {
    // 1 — run getState with the retained admission error
    return Effect.runPromise(getState({ request, error: this.error }));
  }

  /*
   * ServiceFrontendApiFailure.getFinalizedCommands answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getFinalizedCommands(
    request: Parameters<ServiceFrontendApi['getFinalizedCommands']>[0],
  ): ReturnType<ServiceFrontendApi['getFinalizedCommands']> {
    // 1 — run getFinalizedCommands with the retained admission error
    return Effect.runPromise(
      getFinalizedCommands({ request, error: this.error }),
    );
  }

  /*
   * ServiceFrontendApiFailure.createWebSocketTicket answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async createWebSocketTicket(
    request: Parameters<ServiceFrontendApi['createWebSocketTicket']>[0],
  ): ReturnType<ServiceFrontendApi['createWebSocketTicket']> {
    // 1 — run createWebSocketTicket with the retained admission error
    return Effect.runPromise(
      createWebSocketTicket({ request, error: this.error }),
    );
  }
}
