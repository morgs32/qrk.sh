import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { AggregateSessionApiFailure } from '../../../AggregateSessionApi/AggregateSessionApiFailure/AggregateSessionApiFailure.js';

export const authorize = Effect.fn('AggregateAccessApiFailure.authorize')(
  function* (props: { error: IAnyError }) {
    return new AggregateSessionApiFailure(props.error);
  },
);
