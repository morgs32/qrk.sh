import type { InferResource } from '@zerospin/core/models/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { useLiveQuery, useSession } from '@zerospin/react';
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
import { type Product } from '@/zerospin/models/Product';
import { type User } from '@/zerospin/models/User';
import { ZerospinApp } from '@/zerospin/ZerospinApp';

export function ProductCard(props: {
  product: InferResource<typeof Product>;
  userId: ReturnType<typeof User.prefixId>;
}) {
  const { product, userId } = props;
  const session = useSession(ZerospinApp.frontends.web);
  const { data: cart } = useLiveQuery(ZerospinApp.frontends.web, {
    query: db => db.query.cart.findFirst(),
  });
  const { data: cartItem } = useLiveQuery(ZerospinApp.frontends.web, {
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
            amount={cartItem.amount}
            cartItemId={cartItem.id}
            unit={cartItem.unit}
          />
        ) : (
          <Button
            className="self-end"
            size="sm"
            variant="outline"
            onClick={() => {
              let cartId = cart?.id;
              if (!cartId) {
                const { payload } = Effect.runSync(
                  decodeRpc(
                    session.executeCommand({
                      contractName: 'createCart',
                      payload: { userId },
                    }),
                  ),
                );
                cartId = payload.id;
              }
              Effect.runSync(
                decodeRpc(
                  session.executeCommand({
                    contractName: 'addToCart',
                    payload: {
                      cartId,
                      product,
                      quantity: 1,
                    },
                  }),
                ),
              );
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
