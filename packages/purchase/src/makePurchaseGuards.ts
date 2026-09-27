import { type IAnyError } from '@zerospin/error';
import '@zerospin/server-only';
import { Effect } from 'effect';

import { purchaseStateConflict } from './failures.js';

const authoritative =
  <PROPS>(guard: (props: PROPS) => Effect.Effect<void, IAnyError>) =>
  (props: PROPS) =>
    guard(props).pipe(
      Effect.mapError(failure =>
        purchaseStateConflict.make({ message: failure.message }),
      ),
    );
export const makePurchaseGuards = <
  CREATE,
  PAYMENT,
  PROMOTION,
  RELEASES,
  FAILURE,
>(module: {
  contracts: {
    createAcceptedPurchase: {
      guard?: (props: CREATE) => Effect.Effect<void, IAnyError>;
    };
    recordPaymentObservation: {
      guard?: (props: PAYMENT) => Effect.Effect<void, IAnyError>;
    };
    recordPromotion: {
      guard?: (props: PROMOTION) => Effect.Effect<void, IAnyError>;
    };
    recordPromotionReleases: {
      guard?: (props: RELEASES) => Effect.Effect<void, IAnyError>;
    };
    failCheckout: {
      guard?: (props: FAILURE) => Effect.Effect<void, IAnyError>;
    };
  };
}) => ({
  createAcceptedPurchase: authoritative(
    module.contracts.createAcceptedPurchase.guard!,
  ),
  recordPaymentObservation: authoritative(
    module.contracts.recordPaymentObservation.guard!,
  ),
  recordPromotion: authoritative(module.contracts.recordPromotion.guard!),
  recordPromotionReleases: authoritative(
    module.contracts.recordPromotionReleases.guard!,
  ),
  failCheckout: authoritative(module.contracts.failCheckout.guard!),
});
