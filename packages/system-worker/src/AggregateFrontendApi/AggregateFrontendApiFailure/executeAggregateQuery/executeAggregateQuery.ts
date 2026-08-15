import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { AggregateFrontendApi } from '../../AggregateFrontendApi.js';

export const executeAggregateQuery = Effect.fn(
  'AggregateFrontendApiFailure.executeAggregateQuery',
)(
  (props: {
    error: IAnyError;
    request: Parameters<AggregateFrontendApi['executeAggregateQuery']>[0];
  }) => Effect.succeed({ result: encodeLeft(props.error), link: null }),
);
