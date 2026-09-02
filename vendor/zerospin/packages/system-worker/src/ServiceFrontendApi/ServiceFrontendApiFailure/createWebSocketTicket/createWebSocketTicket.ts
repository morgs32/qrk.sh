import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { ServiceFrontendApi } from '../../ServiceFrontendApi.js';

export const createWebSocketTicket = Effect.fn(
  'ServiceFrontendApiFailure.createWebSocketTicket',
)((props: {
  error: IAnyError;
  request: Parameters<ServiceFrontendApi['createWebSocketTicket']>[0];
}) => {
  const { error } = props;
  return Effect.succeed({ result: encodeFailure(error), link: null });
});
