import { makeId } from '@zerospin/core/models/make/makeId';
import type { InferResource } from '@zerospin/core/models/types';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { stageServiceCommand, useLiveQuery } from '@zerospin/react';
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
import { useCartCommand } from '@/hooks/useCartCommand';
import type { IClerkUserId } from '@/zerospin/claims';
import { ensureCart } from '@/zerospin/ensureCart';
import { cartItemV1 } from '@/zerospin/services/marketplace/models/cartItem/CartItemV1';
import { type productV1 } from '@/zerospin/services/marketplace/models/product/ProductV1';
import { shopperSession } from '@/zerospin/shopperSession';

export function ProductCard(props: {
  product: InferResource<typeof productV1>;
  userId: IClerkUserId;
}) {
  const { product, userId } = props;
  const { pending, error, submit } = useCartCommand();
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
            disabled={
              pending ||
              shopperSession.can(
                cart
                  ? {
                      contractName: 'addToCart',
                      payload: {
                        cartItemId: 'cit_preview',
                        cartId: cart.id,
                        product,
                        amount: 1,
                      },
                    }
                  : {
                      contractName: 'createCart',
                      payload: { id: 'crt_preview', userId },
                    },
              )._tag === 'Failure'
            }
            className="self-end"
            size="sm"
            variant="outline"
            onClick={() =>
              void submit(async record => {
                const cartId = await ensureCart(userId);
                const result = await stageServiceCommand({
                  session: shopperSession,
                  contractName: 'addToCart',
                  payload: {
                    cartItemId: Effect.runSync(
                      makeId(cartItemV1).pipe(Effect.provide(NanoIdFactory)),
                    ),
                    cartId,
                    product,
                    amount: 1,
                  },
                });
                if (result._tag === 'Failure') throw result.failure;
                record(result.success.id);
              })
            }
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
