import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { SystemApi } from '../../SystemApi.js';

export const getServiceFrontendRepoTableRows = Effect.fn(
  'SystemApiFailure.getServiceFrontendRepoTableRows',
)(
  (props: {
    error: IAnyError;
    request: Parameters<SystemApi['getServiceFrontendRepoTableRows']>[0];
  }) => Effect.succeed({ result: encodeLeft(props.error), link: null }),
);
