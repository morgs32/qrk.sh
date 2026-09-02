import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { ServiceFrontendApi } from '../../ServiceFrontendApi.js';

export const getState = Effect.fn('ServiceFrontendApiFailure.getState')(
  (props: {
    error: IAnyError;
    request: Parameters<ServiceFrontendApi['getState']>[0];
  }) => {
    const { error } = props;
    return Effect.succeed({ result: encodeFailure(error), link: null });
  },
);
