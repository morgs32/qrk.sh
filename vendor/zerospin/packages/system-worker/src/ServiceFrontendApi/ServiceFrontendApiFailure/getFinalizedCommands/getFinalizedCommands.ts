import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { ServiceFrontendApi } from '../../ServiceFrontendApi.js';

export const getFinalizedCommands = Effect.fn(
  'ServiceFrontendApiFailure.getFinalizedCommands',
)((props: {
  error: IAnyError;
  request: Parameters<ServiceFrontendApi['getFinalizedCommands']>[0];
}) => Effect.succeed({ result: encodeFailure(props.error), link: null }));
