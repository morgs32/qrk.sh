import { resultFailure } from '@zerospin/core/utils/resultFailure';
import {
  encodeError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { Effect } from 'effect';

import type { SystemApi } from '../../SystemApi.js';

/** Return the retained admission failure without accepting any definitions. */
export const checkSystemSpec = Effect.fn('SystemApiFailure.checkSystemSpec')(
  (props: {
    error: IAnyError | IZerospinErrorJson;
    request: Parameters<SystemApi['checkSystemSpec']>[0];
  }) =>
    encodeError(props.error).pipe(
      Effect.map(failure => ({ result: resultFailure(failure), link: null })),
    ),
);
