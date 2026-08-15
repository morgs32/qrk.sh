import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { AggregateFrontendApiFailure } from '../../../AggregateFrontendApi/AggregateFrontendApiFailure/AggregateFrontendApiFailure.js';
import type { AuthenticatedApiFailure } from '../AuthenticatedApiFailure.js';

export const getAggregateFrontendApi = Effect.fn(
  'AuthenticatedApiFailure.getAggregateFrontendApi',
)(
  (props: {
    error: IAnyError;
    request: Parameters<AuthenticatedApiFailure['getAggregateFrontendApi']>[0];
  }) => Effect.succeed(new AggregateFrontendApiFailure(props.error)),
);
