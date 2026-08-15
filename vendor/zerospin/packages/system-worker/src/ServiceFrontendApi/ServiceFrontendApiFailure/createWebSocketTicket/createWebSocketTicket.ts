import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { ServiceFrontendApi } from '../../ServiceFrontendApi.js';

export const createWebSocketTicket = Effect.fn(
  'ServiceFrontendApiFailure.createWebSocketTicket',
)(
  (props: {
    error: IAnyError;
    request: Parameters<ServiceFrontendApi['createWebSocketTicket']>[0];
  }) => Effect.succeed({ result: encodeLeft(props.error), link: null }),
);
