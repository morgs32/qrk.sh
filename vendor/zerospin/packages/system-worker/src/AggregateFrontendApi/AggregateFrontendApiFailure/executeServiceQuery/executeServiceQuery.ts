import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { AggregateFrontendApi } from '../../AggregateFrontendApi.js';

export const executeServiceQuery = Effect.fn(
  'AggregateFrontendApiFailure.executeServiceQuery',
)((props: {
  error: IAnyError;
  request: Parameters<AggregateFrontendApi['executeServiceQuery']>[0];
}) => {
  const { error } = props;
  return Effect.succeed({ result: encodeFailure(error), link: null });
});
