import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { SystemApi } from '../../SystemApi.js';

export const getMaterializedServiceRepos = Effect.fn('SystemApiFailure.getMaterializedServiceRepos')(
  (props: {
    error: IAnyError;
    request: Parameters<SystemApi['getMaterializedServiceRepos']>[0];
  }) => {
    const { error } = props;
    return Effect.succeed({ result: encodeFailure(error), link: null });
  },
);
