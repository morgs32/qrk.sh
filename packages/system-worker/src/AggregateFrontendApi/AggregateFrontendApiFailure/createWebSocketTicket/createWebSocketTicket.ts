import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { AggregateFrontendApi } from '../../AggregateFrontendApi.js';

export const createWebSocketTicket = Effect.fn(
  'AggregateFrontendApiFailure.createWebSocketTicket',
)((props: {
  error: IAnyError;
  request: Parameters<AggregateFrontendApi['createWebSocketTicket']>[0];
}) => {
  const { error } = props;
  return Effect.succeed({ result: encodeFailure(error), link: null });
});
