import { useState } from 'react';

import type { InferResource } from '@zerospin/core/models/types';
import { stageCommand, useLiveQuery } from '@zerospin/react';
import { checkGuards } from '@zerospin/sdk/browser';
import { Effect } from 'effect';
import { Minus, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { type cartItemV2 } from '@/zerospin/aggregates/shopper/models/cartItem/CartItemV2';
import { shopperSession } from '@/zerospin/shopperSession';

interface IProps {
  cartItemId: InferResource<typeof cartItemV2>['id'];
  amount: number;
}

export function CartItemQuantityControls({ amount, cartItemId }: IProps) {
  const [error, setError] = useState<string | null>(null);
  useLiveQuery({
    session: shopperSession,
    query: db =>
      db.query.checkout.findFirst({
        where: { status: { in: ['accepted', 'paying', 'declined'] } },
      }),
  });
  const { data: removal } = useLiveQuery({
    session: shopperSession,
    query: db =>
      db.query.cartItem.findFirst({
        where: { id: { eq: cartItemId } },
        with: { cart: { with: { items: true, checkouts: true } } },
      }),
  });
  const releaseCheckoutIds =
    removal?.cart?.items.length === 1
      ? removal.cart.checkouts
          .filter(
            row =>
              row.promotionReservationId !== null &&
              (row.status === 'promotion' || row.status === 'failed'),
          )
          .map(row => row.id)
      : [];
  const removeFailure = Effect.runSync(
    checkGuards({
      session: shopperSession,
      contractName: 'removeFromCart',
      payload: { id: cartItemId, releaseCheckoutIds },
    }),
  );
  const quantityFailure = (nextAmount: number) =>
    Effect.runSync(
      checkGuards({
        session: shopperSession,
        contractName: 'updateCartItemQuantity',
        payload: { cartItemId, amount: nextAmount },
      }),
    );
  const onDecrement = () => {
    setError(null);
    if (amount <= 1) {
      const result = stageCommand({
        session: shopperSession,
        contractName: 'removeFromCart',
        payload: { id: cartItemId, releaseCheckoutIds },
      });
      if (result._tag === 'Failure') {
        setError(result.failure.message);
      }
      return;
    }
    const result = stageCommand({
      session: shopperSession,
      contractName: 'updateCartItemQuantity',
      payload: {
        cartItemId,
        amount: amount - 1,
      },
    });
    if (result._tag === 'Failure') {
      setError(result.failure.message);
    }
  };

  const onIncrement = () => {
    setError(null);
    const result = stageCommand({
      session: shopperSession,
      contractName: 'updateCartItemQuantity',
      payload: {
        cartItemId,
        amount: amount + 1,
      },
    });
    if (result._tag === 'Failure') {
      setError(result.failure.message);
    }
  };

  const onRemove = () => {
    setError(null);
    const result = stageCommand({
      session: shopperSession,
      contractName: 'removeFromCart',
      payload: { id: cartItemId, releaseCheckoutIds },
    });
    if (result._tag === 'Failure') {
      setError(result.failure.message);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Button
        disabled={
          (amount <= 1 ? removeFailure : quantityFailure(amount - 1)) !== null
        }
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={onDecrement}
      >
        <Minus className="h-3 w-3" />
      </Button>
      <span className="min-w-[2rem] text-center text-sm font-medium">
        {amount}
      </span>
      <Button
        disabled={quantityFailure(amount + 1) !== null}
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={onIncrement}
      >
        <Plus className="h-3 w-3" />
      </Button>
      <Button
        disabled={removeFailure !== null}
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      {error === null ? null : (
        <p className="w-full" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
