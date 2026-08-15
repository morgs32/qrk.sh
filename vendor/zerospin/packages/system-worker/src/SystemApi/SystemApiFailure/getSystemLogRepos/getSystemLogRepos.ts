import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { SystemApi } from '../../SystemApi.js';

export const getSystemLogRepos = Effect.fn(
  'SystemApiFailure.getSystemLogRepos',
)(
  (props: {
    error: IAnyError;
    request: Parameters<SystemApi['getSystemLogRepos']>[0];
  }) => Effect.succeed({ result: encodeLeft(props.error), link: null }),
);
