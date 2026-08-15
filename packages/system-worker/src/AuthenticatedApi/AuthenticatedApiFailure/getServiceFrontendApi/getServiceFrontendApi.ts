import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { ServiceFrontendApiFailure } from '../../../ServiceFrontendApi/ServiceFrontendApiFailure/ServiceFrontendApiFailure.js';
import type { AuthenticatedApiFailure } from '../AuthenticatedApiFailure.js';

export const getServiceFrontendApi = Effect.fn(
  'AuthenticatedApiFailure.getServiceFrontendApi',
)(
  (props: {
    error: IAnyError;
    request: Parameters<AuthenticatedApiFailure['getServiceFrontendApi']>[0];
  }) => Effect.succeed(new ServiceFrontendApiFailure(props.error)),
);
