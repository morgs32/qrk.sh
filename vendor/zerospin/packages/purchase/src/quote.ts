import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Schema } from 'effect';

export const PurchaseQuoteSchema = Schema.Struct({
  currency: Schema.Literal('usd'),
  items: Schema.Array(
    Schema.Struct({
      cartItemId: makeAbbreviationIdSchema('cit'),
      productId: makeAbbreviationIdSchema('prd'),
      name: Schema.String,
      quantity: Schema.Number,
      unitAmount: Schema.Number,
    }),
  ),
  subtotalAmount: Schema.Number,
  discountAmount: Schema.Number,
  promotionReservationId: Schema.NullOr(makeAbbreviationIdSchema('prv')),
  totalAmount: Schema.Number,
});

export function makePurchaseQuote(
  items: readonly {
    id: `cit_${string}`;
    amount: number;
    product: {
      id: `prd_${string}`;
      name: string;
      price: number;
    };
  }[],
  reservationId: `prv_${string}` | null = null,
): typeof PurchaseQuoteSchema.Type {
  const lines = items
    .map(item => ({
      cartItemId: item.id,
      productId: item.product.id,
      name: item.product.name,
      quantity: item.amount,
      unitAmount: Math.round(item.product.price * 100),
    }))
    .sort((a, b) => a.cartItemId.localeCompare(b.cartItemId));
  const subtotalAmount = lines.reduce(
    (sum, item) => sum + item.quantity * item.unitAmount,
    0,
  );
  const discountAmount =
    reservationId === null ? 0 : Math.floor(subtotalAmount / 2);
  return {
    currency: 'usd',
    items: lines,
    subtotalAmount,
    discountAmount,
    promotionReservationId: reservationId,
    totalAmount: subtotalAmount - discountAmount,
  };
}
