import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { SystemApi } from '../../SystemApi.js';

export const getServiceRepos = Effect.fn('SystemApiFailure.getServiceRepos')(
  (props: {
    error: IAnyError;
    request: Parameters<SystemApi['getServiceRepos']>[0];
  }) => Effect.succeed({ result: encodeLeft(props.error), link: null }),
);
