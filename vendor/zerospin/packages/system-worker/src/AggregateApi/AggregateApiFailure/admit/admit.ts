import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { AggregateAccessApiFailure } from '../../../AggregateAccessApi/AggregateAccessApiFailure/AggregateAccessApiFailure.js';

export const admit = Effect.fn('AggregateApiFailure.admit')(function* (props: {
  error: IAnyError;
}) {
  return new AggregateAccessApiFailure(props.error);
});
