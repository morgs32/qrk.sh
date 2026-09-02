import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { AggregateFrontendApi } from '../../AggregateFrontendApi.js';

export const pushCommand = Effect.fn(
  'AggregateFrontendApiFailure.pushCommand',
)((props: {
  error: IAnyError;
  request: Parameters<AggregateFrontendApi['pushCommand']>[0];
}) => Effect.succeed({ result: encodeFailure(props.error), link: null }));
