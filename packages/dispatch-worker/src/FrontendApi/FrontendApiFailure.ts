import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { type IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { BrandTypeId } from 'effect/Brand';

import type { FrontendApi } from './FrontendApi';

export class FrontendApiFailure extends RpcTarget {
  declare [BrandTypeId]: 'TargetApi';

  constructor(private readonly error: IAnyError) {
    super();
  }

  async makeFrontendSpec(
    _request: Parameters<FrontendApi['makeFrontendSpec']>[0],
  ): ReturnType<FrontendApi['makeFrontendSpec']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getFrontendState(
    _request: Parameters<FrontendApi['getFrontendState']>[0],
  ): ReturnType<FrontendApi['getFrontendState']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async fetchActor(
    _request: Parameters<FrontendApi['fetchActor']>[0],
  ): ReturnType<FrontendApi['fetchActor']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async pushCommands(
    _request: Parameters<FrontendApi['pushCommands']>[0],
  ): ReturnType<FrontendApi['pushCommands']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async executeServiceQuery(
    _request: Parameters<FrontendApi['executeServiceQuery']>[0],
  ): ReturnType<FrontendApi['executeServiceQuery']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async executeActorQuery(
    _request: Parameters<FrontendApi['executeActorQuery']>[0],
  ): ReturnType<FrontendApi['executeActorQuery']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }
}
