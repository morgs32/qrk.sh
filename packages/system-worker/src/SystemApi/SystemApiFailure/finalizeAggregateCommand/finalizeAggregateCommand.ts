import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { SystemApi } from '../../SystemApi.js';

export const finalizeAggregateCommand = Effect.fn(
  'SystemApiFailure.finalizeAggregateCommand',
)((props: {
  error: IAnyError;
  request: Parameters<SystemApi['finalizeAggregateCommand']>[0];
}) => Effect.succeed({ result: encodeFailure(props.error), link: null }));
