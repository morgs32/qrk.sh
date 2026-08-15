import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { SystemApi } from '../../SystemApi.js';

export const executeSelectQuery = Effect.fn(
  'SystemApiFailure.executeSelectQuery',
)(
  (props: {
    error: IAnyError;
    request: Parameters<SystemApi['executeSelectQuery']>[0];
  }) => Effect.succeed({ result: encodeLeft(props.error), link: null }),
);
