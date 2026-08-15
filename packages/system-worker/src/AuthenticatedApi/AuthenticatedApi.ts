import type { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { ISystemId } from '@zerospin/core/system/types';
import type { IAnyErrorJson } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import type { Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';

import type { AggregateFrontendApi } from '../AggregateFrontendApi/AggregateFrontendApi.js';
import type { AggregateFrontendApiFailure } from '../AggregateFrontendApi/AggregateFrontendApiFailure/AggregateFrontendApiFailure.js';
import type { ISystemRuntime } from '../makeSystemRuntime.js';
import type { ServiceFrontendApi } from '../ServiceFrontendApi/ServiceFrontendApi.js';
import type { ServiceFrontendApiFailure } from '../ServiceFrontendApi/ServiceFrontendApiFailure/ServiceFrontendApiFailure.js';

import { getAggregateFrontendApi } from './getAggregateFrontendApi/getAggregateFrontendApi.js';
import { getAuthentication } from './getAuthentication/getAuthentication.js';
import { getServiceFrontendApi } from './getServiceFrontendApi/getServiceFrontendApi.js';

export class AuthenticatedApi extends RpcTarget {
  declare [BrandTypeId]: 'TargetApi';

  readonly #authentication: {
    readonly authenticationLock: Schema.Schema.Type<
      typeof AuthenticationLockSchema
    >;
    readonly generationId: string;
    readonly systemId: ISystemId;
    readonly systemName: string;
    readonly systemVersion: string;
    readonly systemWorkerName: string;
    readonly userId: string;
  };
  readonly #runtime: ISystemRuntime;

  constructor(props: {
    authentication: {
      readonly authenticationLock: Schema.Schema.Type<
        typeof AuthenticationLockSchema
      >;
      readonly generationId: string;
      readonly systemId: ISystemId;
      readonly systemName: string;
      readonly systemVersion: string;
      readonly systemWorkerName: string;
      readonly userId: string;
    };
    runtime: ISystemRuntime;
  }) {
    super();
    this.#authentication = props.authentication;
    this.#runtime = props.runtime;
  }

  async getAuthentication(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
        systemId: ISystemId;
        systemName: string;
        systemVersion: string;
        userId: string;
      }>,
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      getAuthentication({ authentication: this.#authentication }),
    );
  }

  async getAggregateFrontendApi(props: {
    aggregateId: IAggregateId;
    aggregateName: string;
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
  }): Promise<AggregateFrontendApi | AggregateFrontendApiFailure> {
    return this.#runtime.runPromise(
      getAggregateFrontendApi({
        authentication: this.#authentication,
        request: props,
        runtime: this.#runtime,
      }),
    );
  }

  async getServiceFrontendApi(props: {
    serviceName: string;
    frontendName: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  }): Promise<ServiceFrontendApi | ServiceFrontendApiFailure> {
    return this.#runtime.runPromise(
      getServiceFrontendApi({
        authentication: this.#authentication,
        request: props,
        runtime: this.#runtime,
      }),
    );
  }
}
