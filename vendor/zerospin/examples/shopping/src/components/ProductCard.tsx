import { useState } from 'react';

import { makeId } from '@zerospin/core/models/makeId';
import type { InferResource } from '@zerospin/core/models/types';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { stageCommand, useLiveQuery } from '@zerospin/react';
import { Effect } from 'effect';
import { ShoppingCart } from 'lucide-react';

import { CartItemQuantityControls } from './CartItemQuantityControls';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cartV1 } from '@/zerospin/aggregates/shopper/models/cart/CartV1';
import { cartItemV2 } from '@/zerospin/aggregates/shopper/models/cartItem/CartItemV2';
import { type userV1 } from '@/zerospin/aggregates/shopper/models/user/UserV1';
import { type productV1 } from '@/zerospin/services/app/models/product/ProductV1';
import { shopperSession } from '@/zerospin/ZerospinApp';

export function ProductCard(props: {
  product: InferResource<typeof productV1>;
  userId: InferResource<typeof userV1>['id'];
}) {
  const { product, userId } = props;
  const [error, setError] = useState<string | null>(null);
  const { data: cart } = useLiveQuery({
    session: shopperSession,
    query: db => db.query.cart.findFirst(),
  });
  const { data: cartItem } = useLiveQuery({
    session: shopperSession,
    key: { cartId: cart?.id, productId: product.id },
    query: (db, { cartId, productId }) =>
      db.query.cartItem.findFirst({
        where: {
          cartId: { eq: cartId },
          productId: { eq: productId },
        },
      }),
  });

  return (
    <Card className="flex flex-col gap-0 overflow-hidden border-border/80 bg-card py-0 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="p-3 pb-6">
        <CardTitle className="text-base leading-snug">{product.name}</CardTitle>
        <CardDescription className="line-clamp-2">
          {product.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col p-0" />
      <CardFooter className="mt-auto flex flex-col items-stretch gap-3 border-t bg-muted/40 p-3 [.border-t]:pt-3">
        <span className="text-right font-mono text-lg font-semibold leading-none tabular-nums">
          ${product.price.toFixed(2)}
        </span>
        {cartItem ? (
          <CartItemQuantityControls
            amount={cartItem.amount}
            cartItemId={cartItem.id}
          />
        ) : (
          <Button
            className="self-end"
            size="sm"
            variant="outline"
            onClick={() => {
              setError(null);
              let cartId = cart?.id;
              if (!cartId) {
                const result = stageCommand({
                  session: shopperSession,
                  contractName: 'createCart',
                  payload: {
                    id: Effect.runSync(
                      makeId(cartV1).pipe(Effect.provide(NanoIdFactory)),
                    ),
                    userId,
                  },
                });
                if (result._tag === 'Failure') {
                  setError(result.failure.message);
                  return;
                }
                cartId = result.success.payload.id;
              }
              const result = stageCommand({
                session: shopperSession,
                contractName: 'addToCart',
                payload: {
                  cartItemId: Effect.runSync(
                    makeId(cartItemV2).pipe(Effect.provide(NanoIdFactory)),
                  ),
                  cartId,
                  product,
                  amount: 1,
                },
              });
              if (result._tag === 'Failure') {
                setError(result.failure.message);
              }
            }}
          >
            <ShoppingCart className="mr-1.5 h-4 w-4" />
            Add to cart
          </Button>
        )}
        {error === null ? null : <p role="alert">{error}</p>}
      </CardFooter>
    </Card>
  );
}
