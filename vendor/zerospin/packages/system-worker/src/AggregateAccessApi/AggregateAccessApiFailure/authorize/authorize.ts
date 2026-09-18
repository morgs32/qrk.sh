import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { AggregateFrontendApiFailure } from '../../../AggregateFrontendApi/AggregateFrontendApiFailure/AggregateFrontendApiFailure.js';

export const authorize = Effect.fn('AggregateAccessApiFailure.authorize')(
  function* (props: { error: IAnyError }) {
    return new AggregateFrontendApiFailure(props.error);
  },
);
