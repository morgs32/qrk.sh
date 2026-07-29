import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { BrandTypeId } from 'effect/Brand';

import type { ServiceFrontendApi } from './ServiceFrontendApi';

export class ServiceFrontendApiFailure extends RpcTarget {
  declare [BrandTypeId]: 'TargetApi';

  constructor(private readonly error: IAnyError) {
    super();
  }

  async getFrontendState(
    _request: Parameters<ServiceFrontendApi['getFrontendState']>[0],
  ): ReturnType<ServiceFrontendApi['getFrontendState']> {
    return { result: encodeLeft(this.error), link: null };
  }

  async createFrontendWebSocketTicket(
    _request: Parameters<
      ServiceFrontendApi['createFrontendWebSocketTicket']
    >[0],
  ): ReturnType<ServiceFrontendApi['createFrontendWebSocketTicket']> {
    return { result: encodeLeft(this.error), link: null };
  }
}
