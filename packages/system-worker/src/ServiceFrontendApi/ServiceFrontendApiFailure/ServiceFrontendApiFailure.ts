import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import type { ServiceFrontendApi } from '../ServiceFrontendApi.js';

import { createWebSocketTicket } from './createWebSocketTicket/createWebSocketTicket.js';
import { getFinalizedCommands } from './getFinalizedCommands/getFinalizedCommands.js';
import { getState } from './getState/getState.js';

export class ServiceFrontendApiFailure extends RpcTarget {
  constructor(private readonly error: IAnyError) {
    super();
  }

  async getState(
    request: Parameters<ServiceFrontendApi['getState']>[0],
  ): ReturnType<ServiceFrontendApi['getState']> {
    return Effect.runPromise(getState({ request, error: this.error }));
  }

  async getFinalizedCommands(
    request: Parameters<ServiceFrontendApi['getFinalizedCommands']>[0],
  ): ReturnType<ServiceFrontendApi['getFinalizedCommands']> {
    return Effect.runPromise(
      getFinalizedCommands({ request, error: this.error }),
    );
  }

  async createWebSocketTicket(
    request: Parameters<ServiceFrontendApi['createWebSocketTicket']>[0],
  ): ReturnType<ServiceFrontendApi['createWebSocketTicket']> {
    return Effect.runPromise(
      createWebSocketTicket({ request, error: this.error }),
    );
  }
}
