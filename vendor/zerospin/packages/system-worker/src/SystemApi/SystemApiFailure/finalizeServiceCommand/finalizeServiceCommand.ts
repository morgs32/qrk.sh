import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { SystemApi } from '../../SystemApi.js';

export const finalizeServiceCommand = Effect.fn(
  'SystemApiFailure.finalizeServiceCommand',
)((props: {
  error: IAnyError;
  request: Parameters<SystemApi['finalizeServiceCommand']>[0];
}) => Effect.succeed({ result: encodeFailure(props.error), link: null }));
