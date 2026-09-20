import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import type { ServiceFrontendApi } from '../ServiceFrontendApi.js';

import { createWebSocketTicket } from './createWebSocketTicket/createWebSocketTicket.js';
import { getSelectedCommands } from './getSelectedCommands/getSelectedCommands.js';
import { getSnapshot } from './getSnapshot/getSnapshot.js';

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
   * ServiceFrontendApiFailure.getSnapshot answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getSnapshot(
    request: Parameters<ServiceFrontendApi['getSnapshot']>[0],
  ): ReturnType<ServiceFrontendApi['getSnapshot']> {
    // 1 — run getSnapshot with the retained admission error
    return Effect.runPromise(getSnapshot({ request, error: this.error }));
  }

  /*
   * ServiceFrontendApiFailure.getSelectedCommands answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getSelectedCommands(
    request: Parameters<ServiceFrontendApi['getSelectedCommands']>[0],
  ): ReturnType<ServiceFrontendApi['getSelectedCommands']> {
    // 1 — run getSelectedCommands with the retained admission error
    return Effect.runPromise(
      getSelectedCommands({ request, error: this.error }),
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
