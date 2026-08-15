import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import type { IServiceFrontendState } from '@zerospin/core/serviceSession/types';
import type { ISystemId } from '@zerospin/core/system/types';
import type { IAnyErrorJson } from '@zerospin/error';
import type { ILinkedRpcEnvelope, IRpcRequest } from '@zerospin/logger';
import { RpcTarget } from 'capnweb';
import type { Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';

import type { ISystemRuntime } from '../makeSystemRuntime.js';

import { createWebSocketTicket } from './createWebSocketTicket/createWebSocketTicket.js';
import { getAdmission } from './getAdmission/getAdmission.js';
import { getState } from './getState/getState.js';

export class ServiceFrontendApi extends RpcTarget {
  declare [BrandTypeId]: 'TargetApi';

  readonly #authResults: {
    readonly userId: string;
    readonly frontendName: string;
    readonly serviceFrontendLock: Schema.Schema.Type<
      typeof ServiceFrontendLockSchema
    >;
    readonly generationId: string;
    readonly serviceName: string;
    readonly frontendSpec: IFrontendControllerSpec;
    readonly systemId: ISystemId;
    readonly systemVersion: string;
    readonly systemWorkerName: string;
  };
  readonly #runtime: ISystemRuntime;

  constructor(props: {
    authResults: {
      readonly userId: string;
      readonly frontendName: string;
      readonly serviceFrontendLock: Schema.Schema.Type<
        typeof ServiceFrontendLockSchema
      >;
      readonly generationId: string;
      readonly serviceName: string;
      readonly frontendSpec: IFrontendControllerSpec;
      readonly systemId: ISystemId;
      readonly systemVersion: string;
      readonly systemWorkerName: string;
    };
    runtime: ISystemRuntime;
  }) {
    super();
    this.#authResults = props.authResults;
    this.#runtime = props.runtime;
  }

  async getAdmission(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        userId: string;
        serviceName: string;
        frontendName: string;
        serviceFrontendLock: Schema.Schema.Type<
          typeof ServiceFrontendLockSchema
        >;
        frontendSpec: IFrontendControllerSpec;
        systemId: ISystemId;
        systemVersion: string;
      }>,
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      getAdmission({ admission: this.#authResults }),
    );
  }

  async getState(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<IServiceFrontendState, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getState({ request, authResults: this.#authResults }),
    );
  }

  async createWebSocketTicket(request: IRpcRequest<[]>): Promise<
    ILinkedRpcEnvelope<
      {
        ticket: string;
      },
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      createWebSocketTicket({
        request,
        authResults: this.#authResults,
      }),
    );
  }
}
