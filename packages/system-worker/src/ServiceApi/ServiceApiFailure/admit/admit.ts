import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { ServiceAccessApiFailure } from '../../../ServiceAccessApi/ServiceAccessApiFailure/ServiceAccessApiFailure.js';

export const admit = Effect.fn('ServiceApiFailure.admit')(function* (props: {
  error: IAnyError;
}) {
  return new ServiceAccessApiFailure(props.error);
});
