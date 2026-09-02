import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { AggregateFrontendApi } from '../../AggregateFrontendApi.js';

export const getPushedCommands = Effect.fn(
  'AggregateFrontendApiFailure.getPushedCommands',
)((props: {
  error: IAnyError;
  request: Parameters<AggregateFrontendApi['getPushedCommands']>[0];
}) => Effect.succeed({ result: encodeFailure(props.error), link: null }));
