import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { AggregateFrontendApi } from '../../AggregateFrontendApi.js';

export const getState = Effect.fn('AggregateFrontendApiFailure.getState')(
  (props: {
    error: IAnyError;
    request: Parameters<AggregateFrontendApi['getState']>[0];
  }) => Effect.succeed({ result: encodeLeft(props.error), link: null }),
);
