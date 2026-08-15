import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { ServiceFrontendApi } from '../../ServiceFrontendApi.js';

export const getState = Effect.fn('ServiceFrontendApiFailure.getState')(
  (props: {
    error: IAnyError;
    request: Parameters<ServiceFrontendApi['getState']>[0];
  }) => Effect.succeed({ result: encodeLeft(props.error), link: null }),
);
