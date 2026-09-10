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

  /*
   * Constructs GatewayApi with its bound runtime and instance state.
   *
   * 1. Initialize and bind the instance.
   */
  constructor(props: { runtime: ISystemRuntime }) {
    // 1 — construct the base and retain the supplied capability state
    super();
    const { runtime } = props;
    this.#runtime = runtime;
  }

  /*
   * GatewayApi grants a aggregate frontend capability after checking the submitted
   * locks, authentication result, and owner authorization. The capability binds
   * the configured systemId and authenticated userId to the admitted frontend.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateFrontendApi(props: {
    publishableKey: string;
    systemName: string;
    authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
    signature: unknown;
    aggregateId: IAggregateId;
    aggregateName: string;
    aggregateVersion: string;
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
  }): Promise<AggregateFrontendApi | AggregateFrontendApiFailure> {
    // 1 — run getAggregateFrontendApi with the instance-bound dependencies
    return this.#runtime.runPromise(
      getAggregateFrontendApi({
        request: props,
        runtime: this.#runtime,
      }),
    );
  }

  /*
   * GatewayApi grants a service frontend capability after checking the submitted
   * locks, authentication result, and owner authorization. The capability binds
   * the configured systemId and authenticated userId to the admitted frontend.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceFrontendApi(props: {
    publishableKey: string;
    systemName: string;
    authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
    signature: unknown;
    serviceName: string;
    serviceVersion: string;
    frontendName: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  }): Promise<ServiceFrontendApi | ServiceFrontendApiFailure> {
    // 1 — run getServiceFrontendApi with the instance-bound dependencies
    return this.#runtime.runPromise(
      getServiceFrontendApi({
        request: props,
        runtime: this.#runtime,
      }),
    );
  }

  /*
   * GatewayApi grants the deployment-scoped SystemApi to secret-key callers.
   * Admission errors become a failure capability with the same callable surface.
   *
   * 1. Run the bound domain operation.
   */
  async getSystemApi(props: {
    zerospinSecretKey: string;
  }): Promise<SystemApi | SystemApiFailure> {
    // 1 — run getSystemApi with the instance-bound dependencies
    return this.#runtime.runPromise(
      getSystemApi({
        request: props,
        runtime: this.#runtime,
      }),
    );
  }
}
