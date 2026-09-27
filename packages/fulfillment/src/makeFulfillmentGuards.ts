import { type IAnyError } from '@zerospin/error';
import '@zerospin/server-only';
import { Effect } from 'effect';

import { fulfillmentStateConflict } from './failures.js';
const authoritative =
  <PROPS>(guard: (props: PROPS) => Effect.Effect<void, IAnyError>) =>
  (props: PROPS) =>
    guard(props).pipe(
      Effect.mapError(failure =>
        fulfillmentStateConflict.make({ message: failure.message }),
      ),
    );
export const makeFulfillmentGuards = <PACK, SHIP, ENROLL, RECORD>(module: {
  contracts: {
    requestPacking: { guard?: (props: PACK) => Effect.Effect<void, IAnyError> };
    requestShipping: {
      guard?: (props: SHIP) => Effect.Effect<void, IAnyError>;
    };
    enrollFulfillment: {
      guard?: (props: ENROLL) => Effect.Effect<void, IAnyError>;
    };
    recordFulfillmentOperation: {
      guard?: (props: RECORD) => Effect.Effect<void, IAnyError>;
    };
  };
}) => ({
  requestPacking: authoritative(module.contracts.requestPacking.guard!),
  requestShipping: authoritative(module.contracts.requestShipping.guard!),
  enrollFulfillment: authoritative(module.contracts.enrollFulfillment.guard!),
  recordFulfillmentOperation: authoritative(
    module.contracts.recordFulfillmentOperation.guard!,
  ),
});
