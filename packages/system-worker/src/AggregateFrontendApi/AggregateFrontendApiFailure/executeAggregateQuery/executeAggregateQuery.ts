import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { AggregateFrontendApi } from '../../AggregateFrontendApi.js';

export const executeAggregateQuery = Effect.fn(
  'AggregateFrontendApiFailure.executeAggregateQuery',
)((props: {
  error: IAnyError;
  request: Parameters<AggregateFrontendApi['executeAggregateQuery']>[0];
}) => {
  const { error } = props;
  return Effect.succeed({ result: encodeFailure(error), link: null });
});
