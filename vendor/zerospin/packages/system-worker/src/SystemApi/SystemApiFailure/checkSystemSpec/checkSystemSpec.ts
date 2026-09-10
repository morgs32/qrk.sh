import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { SystemApi } from '../../SystemApi.js';

/** Return the retained admission failure without accepting any definitions. */
export const checkSystemSpec = Effect.fn('SystemApiFailure.checkSystemSpec')(
  (props: {
    error: IAnyError;
    request: Parameters<SystemApi['checkSystemSpec']>[0];
  }) => Effect.succeed({ result: encodeFailure(props.error), link: null }),
);
