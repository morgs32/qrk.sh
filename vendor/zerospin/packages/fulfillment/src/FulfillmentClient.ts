import type { InferResource } from '@zerospin/core/models/types';
import type { IAnyError } from '@zerospin/error';
import '@zerospin/server-only';
import { Context, type Effect } from 'effect';

import type { makeFulfillmentModelV1 } from './portable.js';
export type IFulfillmentResult =
  | {
      kind: 'confirmed';
      fulfillment: InferResource<ReturnType<typeof makeFulfillmentModelV1>>;
    }
  | { kind: 'rejected'; reason: string };
export class FulfillmentClient extends Context.Service<
  FulfillmentClient,
  {
    request: (request: {
      serviceVersion: string;
      requestId: string;
      purchaseId: string;
      userId: string;
      aggregateId: string;
    }) => Effect.Effect<IFulfillmentResult, IAnyError>;
    operate: (request: {
      serviceVersion: string;
      operationId: `fop_${string}`;
      fulfillmentId: `ful_${string}`;
      action: 'pack' | 'ship';
      requestId: string;
      purchaseId: string;
      userId: string;
      aggregateId: string;
    }) => Effect.Effect<IFulfillmentResult, IAnyError>;
  }
>()('FulfillmentClient') {}
