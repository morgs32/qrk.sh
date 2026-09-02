import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { SystemApi } from '../../SystemApi.js';

export const getMaterializedServiceFrontendRepoTableRows = Effect.fn(
  'SystemApiFailure.getMaterializedServiceFrontendRepoTableRows',
)((props: {
  error: IAnyError;
  request: Parameters<SystemApi['getMaterializedServiceFrontendRepoTableRows']>[0];
}) => {
  const { error } = props;
  return Effect.succeed({ result: encodeFailure(error), link: null });
});
