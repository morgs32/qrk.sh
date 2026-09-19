import { useState } from 'react';

import type { InferResource } from '@zerospin/core/models/types';
import { stageCommand } from '@zerospin/react';
import { Minus, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { type cartItemV2 } from '@/zerospin/aggregates/shopper/models/cartItem/CartItemV2';
import { shopperSession } from '@/zerospin/ZerospinApp';

interface IProps {
  cartItemId: InferResource<typeof cartItemV2>['id'];
  amount: number;
}

export function CartItemQuantityControls({ amount, cartItemId }: IProps) {
  const [error, setError] = useState<string | null>(null);
  const onDecrement = () => {
    setError(null);
    if (amount <= 1) {
      const result = stageCommand({
        session: shopperSession,
        contractName: 'removeFromCart',
        payload: { id: cartItemId },
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
      payload: { id: cartItemId },
    });
    if (result._tag === 'Failure') {
      setError(result.failure.message);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Button
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
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={onIncrement}
      >
        <Plus className="h-3 w-3" />
      </Button>
      <Button
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
