import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { AggregateFrontendApi } from '../../AggregateFrontendApi.js';

export const pushCommands = Effect.fn(
  'AggregateFrontendApiFailure.pushCommands',
)(
  (props: {
    error: IAnyError;
    request: Parameters<AggregateFrontendApi['pushCommands']>[0];
  }) => Effect.succeed({ result: encodeLeft(props.error), link: null }),
);
