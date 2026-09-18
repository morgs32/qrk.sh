import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { ServiceFrontendApiFailure } from '../../../ServiceFrontendApi/ServiceFrontendApiFailure/ServiceFrontendApiFailure.js';

export const authorize = Effect.fn('ServiceAccessApiFailure.authorize')(
  function* (props: { error: IAnyError }) {
    return new ServiceFrontendApiFailure(props.error);
  },
);
