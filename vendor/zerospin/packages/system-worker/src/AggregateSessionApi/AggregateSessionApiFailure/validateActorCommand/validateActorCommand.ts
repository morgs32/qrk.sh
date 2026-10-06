import { resultFailure } from '@zerospin/core/utils/resultFailure';
import {
  encodeError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { Effect } from 'effect';

import type { AggregateSessionApi } from '../../AggregateSessionApi.js';

export const validateActorCommand = Effect.fn(
  'AggregateSessionApiFailure.validateActorCommand',
)((props: {
  error: IAnyError | IZerospinErrorJson;
  request: Parameters<AggregateSessionApi['validateActorCommand']>[0];
}) => {
  const { error } = props;
  return encodeError(error).pipe(
    Effect.map(failure => ({ result: resultFailure(failure), link: null })),
  );
});
