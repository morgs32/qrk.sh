import { Schema } from 'effect';

export const PurchaseQuote = Schema.Struct({
  purchaseId: Schema.TemplateLiteral(['pur_', Schema.String]),
  items: Schema.Array(
    Schema.Struct({
      id: Schema.TemplateLiteral(['pit_', Schema.String]),
      productId: Schema.TemplateLiteral(['prd_', Schema.String]),
      name: Schema.String,
      price: Schema.Number.check(
        Schema.isInt(),
        Schema.isGreaterThanOrEqualTo(0),
      ),
      quantity: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
    }),
  ),
  total: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
});
export type IPurchaseQuote = typeof PurchaseQuote.Type;
