import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { ServiceAccessApiFailure } from '../../../ServiceAccessApi/ServiceAccessApiFailure/ServiceAccessApiFailure.js';

export const authenticate = Effect.fn('ServiceApiFailure.authenticate')(
  function* (props: { error: IAnyError }) {
    return new ServiceAccessApiFailure(props.error);
  },
);
