import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect, type Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';

import type { AggregateFrontendApiFailure } from '../../AggregateFrontendApi/AggregateFrontendApiFailure/AggregateFrontendApiFailure.js';
import type { ServiceFrontendApiFailure } from '../../ServiceFrontendApi/ServiceFrontendApiFailure/ServiceFrontendApiFailure.js';
import type { AuthenticatedApi } from '../AuthenticatedApi.js';

import { getAggregateFrontendApi } from './getAggregateFrontendApi/getAggregateFrontendApi.js';
import { getAuthentication } from './getAuthentication/getAuthentication.js';
import { getServiceFrontendApi } from './getServiceFrontendApi/getServiceFrontendApi.js';

export class AuthenticatedApiFailure extends RpcTarget {
  declare [BrandTypeId]: 'TargetApi';

  constructor(private readonly error: IAnyError) {
    super();
  }

  async getAuthentication(): ReturnType<AuthenticatedApi['getAuthentication']> {
    return Effect.runPromise(getAuthentication({ error: this.error }));
  }

  async getAggregateFrontendApi(props: {
    aggregateId: IAggregateId;
    aggregateName: string;
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
  }): Promise<AggregateFrontendApiFailure> {
    return Effect.runPromise(
      getAggregateFrontendApi({ error: this.error, request: props }),
    );
  }

  async getServiceFrontendApi(props: {
    serviceName: string;
    frontendName: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  }): Promise<ServiceFrontendApiFailure> {
    return Effect.runPromise(
      getServiceFrontendApi({ error: this.error, request: props }),
    );
  }
}
