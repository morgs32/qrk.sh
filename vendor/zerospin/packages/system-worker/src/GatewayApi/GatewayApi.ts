import type { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import { RpcTarget } from 'capnweb';
import type { Schema } from 'effect';

import type { AggregateFrontendApi } from '../AggregateFrontendApi/AggregateFrontendApi.js';
import type { AggregateFrontendApiFailure } from '../AggregateFrontendApi/AggregateFrontendApiFailure/AggregateFrontendApiFailure.js';
import type { ISystemRuntime } from '../makeSystemRuntime.js';
import type { ServiceFrontendApi } from '../ServiceFrontendApi/ServiceFrontendApi.js';
import type { ServiceFrontendApiFailure } from '../ServiceFrontendApi/ServiceFrontendApiFailure/ServiceFrontendApiFailure.js';
import type { SystemApi } from '../SystemApi/SystemApi.js';
import type { SystemApiFailure } from '../SystemApi/SystemApiFailure/SystemApiFailure.js';

import { getAggregateFrontendApi } from './getAggregateFrontendApi/getAggregateFrontendApi.js';
import { getServiceFrontendApi } from './getServiceFrontendApi/getServiceFrontendApi.js';
import { getSystemApi } from './getSystemApi/getSystemApi.js';

/** Stable Worker-hosted root for public Zerospin capabilities. */
export class GatewayApi extends RpcTarget {
  readonly #runtime: ISystemRuntime;

  constructor(props: { runtime: ISystemRuntime }) {
    super();
    this.#runtime = props.runtime;
  }

  async getAggregateFrontendApi(props: {
    publishableKey: string;
    systemName: string;
    authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
    signature: unknown;
    aggregateId: IAggregateId;
    aggregateName: string;
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
  }): Promise<AggregateFrontendApi | AggregateFrontendApiFailure> {
    return this.#runtime.runPromise(
      getAggregateFrontendApi({
        request: props,
        runtime: this.#runtime,
      }),
    );
  }

  async getServiceFrontendApi(props: {
    publishableKey: string;
    systemName: string;
    authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
    signature: unknown;
    serviceName: string;
    frontendName: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  }): Promise<ServiceFrontendApi | ServiceFrontendApiFailure> {
    return this.#runtime.runPromise(
      getServiceFrontendApi({
        request: props,
        runtime: this.#runtime,
      }),
    );
  }

  async getSystemApi(props: {
    zerospinSecretKey: string;
  }): Promise<SystemApi | SystemApiFailure> {
    return this.#runtime.runPromise(
      getSystemApi({
        request: props,
        runtime: this.#runtime,
      }),
    );
  }
}
