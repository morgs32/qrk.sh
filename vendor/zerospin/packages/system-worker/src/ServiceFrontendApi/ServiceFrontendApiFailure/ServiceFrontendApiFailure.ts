import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';
import { BrandTypeId } from 'effect/Brand';

import type { ServiceFrontendApi } from '../ServiceFrontendApi.js';

import { createWebSocketTicket } from './createWebSocketTicket/createWebSocketTicket.js';
import { getAdmission } from './getAdmission/getAdmission.js';
import { getState } from './getState/getState.js';

export class ServiceFrontendApiFailure extends RpcTarget {
  declare [BrandTypeId]: 'TargetApi';

  constructor(private readonly error: IAnyError) {
    super();
  }

  async getAdmission(): ReturnType<ServiceFrontendApi['getAdmission']> {
    return Effect.runPromise(getAdmission({ error: this.error }));
  }

  async getState(
    request: Parameters<ServiceFrontendApi['getState']>[0],
  ): ReturnType<ServiceFrontendApi['getState']> {
    return Effect.runPromise(getState({ request, error: this.error }));
  }

  async createWebSocketTicket(
    request: Parameters<ServiceFrontendApi['createWebSocketTicket']>[0],
  ): ReturnType<ServiceFrontendApi['createWebSocketTicket']> {
    return Effect.runPromise(
      createWebSocketTicket({ request, error: this.error }),
    );
  }
}
