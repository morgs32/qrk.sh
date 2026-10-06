import { encodePayload } from '@zerospin/core/contracts/encodePayload';
import type { IAnyError } from '@zerospin/error';
import { Context, Effect } from 'effect';

import { createPurchaseV1 } from './aggregates/user/contracts/createPurchaseV1';
import type { IPurchaseQuote } from './purchaseQuote';

export class ShoppingPurchaseDelivery extends Context.Service<
  ShoppingPurchaseDelivery,
  {
    deliver(input: {
      aggregateId: string;
      quote: IPurchaseQuote;
    }): Effect.Effect<void, IAnyError>;
  }
>()('ShoppingPurchaseDelivery') {}

/** Complete occurrence is reconstructed identically from the immutable transfer payload on every retry. */
export const purchaseDeliveryCommand = ({
  aggregateId,
  quote,
}: {
  aggregateId: string;
  quote: IPurchaseQuote;
}) => ({
  id: `cmd_purchase_${quote.purchaseId.slice(4)}` as const,
  commandName: 'createPurchase',
  contractVersion: '1.0.0',
  payload: Effect.runSync(
    encodePayload(createPurchaseV1, {
      version: createPurchaseV1.version,
      payload: { quote },
    }),
  ),
  systemName: 'shopping',
  aggregateName: 'user',
  aggregateVersion: '1.0.0',
  aggregateId,
  actorName: 'admin',
  actorVersion: '1.0.0',
  claims: { aggregateId },
  nodeId: null,
  nodeIndex: null,
  sessionName: null,
});
