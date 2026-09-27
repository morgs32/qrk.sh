import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { ServiceSessionApiFailure } from '../../../ServiceSessionApi/ServiceSessionApiFailure/ServiceSessionApiFailure.js';

export const authorize = Effect.fn('ServiceAccessApiFailure.authorize')(
  function* (props: { error: IAnyError }) {
    return new ServiceSessionApiFailure(props.error);
  },
);
