import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { AggregateFrontendApi } from '../../AggregateFrontendApi.js';

export const getFinalizedCommands = Effect.fn(
  'AggregateFrontendApiFailure.getFinalizedCommands',
)((props: {
  error: IAnyError;
  request: Parameters<AggregateFrontendApi['getFinalizedCommands']>[0];
}) => Effect.succeed({ result: encodeFailure(props.error), link: null }));
