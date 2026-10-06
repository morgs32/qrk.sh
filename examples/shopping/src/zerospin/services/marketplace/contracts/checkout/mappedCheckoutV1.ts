/* oxlint-disable react-hooks/rules-of-hooks -- Effect Context service use is not a React hook. */
import * as sdk from '@zerospin/sdk';
import { Effect, Schema } from 'effect';

import { userAggregateId, userClaims } from '../../../../claims';
import { PurchaseQuote } from '../../../../purchaseQuote';
import { ShoppingPurchaseDelivery } from '../../../../ShoppingPurchaseDelivery';

import { checkoutV1 } from './checkoutV1';

export const asyncCreatePurchaseV1 = sdk.makeExternalContract({
  name: 'asyncCreatePurchase',
  version: '1.0.0',
  claims: userClaims,
  payload: {
    aggregateId: sdk.primitives.text(),
    quote: sdk.primitives.json({ schema: PurchaseQuote }),
  },
  external: {
    response: Schema.Null,
    request: ({ payload }) =>
      ShoppingPurchaseDelivery.use(delivery => delivery.deliver(payload)).pipe(
        Effect.as(null),
      ),
  },
  result: Schema.Null,
  program: () => Effect.succeed(null),
});
export const mappedCheckoutV1 = sdk.mapContractVersion({
  contractVersion: checkoutV1,
  operations: {
    models: {},
    contracts: { asyncCreatePurchase: asyncCreatePurchaseV1 },
  },
  result: PurchaseQuote,
  program: ({ command, claims, operations }) =>
    Effect.gen(function* () {
      yield* operations.contracts.asyncCreatePurchase({
        aggregateId: userAggregateId(claims.clerkUserId),
        quote: command.result,
      });
      return command.result;
    }),
});
