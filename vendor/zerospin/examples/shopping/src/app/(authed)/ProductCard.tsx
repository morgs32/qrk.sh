'use client';

import type { InferResource } from '@zerospin/core/models/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { useLiveQuery } from '@zerospin/react/useLiveQuery';
import { useSession } from '@zerospin/react/useSession';
import { Effect } from 'effect';
import { ShoppingCart } from 'lucide-react';

import { CartItemQuantityControls } from './CartItemQuantityControls';
import { ZerospinShopper } from './ZerospinShopper';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { type Product, type User } from '@/zerospin/models';

export function ProductCard(props: {
  product: InferResource<typeof Product>;
  userId: ReturnType<typeof User.prefixId>;
}) {
  const { product, userId } = props;
  const session = useSession(ZerospinShopper);
  const { data: cart } = useLiveQuery(ZerospinShopper, {
    query: db => db.query.cart.findFirst(),
  });
  const { data: cartItem } = useLiveQuery(ZerospinShopper, {
    query: db =>
      db.query.cartItem.findFirst({
        where: {
          cartId: { eq: cart?.id },
          productId: { eq: product.id },
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
            cartItemId={cartItem.id}
            quantity={cartItem.quantity}
          />
        ) : (
          <Button
            className="self-end"
            size="sm"
            variant="outline"
            onClick={() => {
              void (async () => {
                let cartId = cart?.id;
                if (!cartId) {
                  const { payload } = await session
                    .stageCommand({
                      contractName: 'createCart',
                      payload: {
                        userId,
                      },
                    })
                    .then(encoded => Effect.runPromise(decodeRpc(encoded)));
                  cartId = payload.id;
                }
                await session.stageCommand({
                  contractName: 'addToCart',
                  payload: {
                    cartId,
                    product,
                    quantity: 1,
                  },
                });
              })();
            }}
          >
            <ShoppingCart className="mr-1.5 h-4 w-4" />
            Add to cart
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
