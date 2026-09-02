import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { AggregateFrontendApi } from '../../AggregateFrontendApi.js';

export const getState = Effect.fn('AggregateFrontendApiFailure.getState')(
  (props: {
    error: IAnyError;
    request: Parameters<AggregateFrontendApi['getState']>[0];
  }) => {
    const { error } = props;
    return Effect.succeed({ result: encodeFailure(error), link: null });
  },
);
