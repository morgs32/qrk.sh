import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { SystemApi } from '../../SystemApi.js';

export const getServiceFrontendBlockRepoTableRows = Effect.fn(
  'SystemApiFailure.getServiceFrontendBlockRepoTableRows',
)(
  (props: {
    error: IAnyError;
    request: Parameters<SystemApi['getServiceFrontendBlockRepoTableRows']>[0];
  }) => Effect.succeed({ result: encodeLeft(props.error), link: null }),
);
