import type { InferResource } from '@zerospin/core/models/types';
import { useSession } from '@zerospin/react';
import { Minus, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { type cartItemV2 } from '@/zerospin/aggregates/shopper/models/cartItem/cartItemV2';
import { ZerospinApp } from '@/zerospin/ZerospinApp';

interface IProps {
  cartItemId: InferResource<typeof cartItemV2>['id'];
  amount: number;
}

export function CartItemQuantityControls({ amount, cartItemId }: IProps) {
  const session = useSession(ZerospinApp.frontends.web);

  const onDecrement = () => {
    if (amount <= 1) {
      void session.executeCommand({
        contractName: 'removeFromCart',
        payload: { id: cartItemId },
      });
      return;
    }
    void session.executeCommand({
      contractName: 'updateCartItemQuantity',
      payload: {
        cartItemId,
        amount: amount - 1,
      },
    });
  };

  const onIncrement = () => {
    void session.executeCommand({
      contractName: 'updateCartItemQuantity',
      payload: {
        cartItemId,
        amount: amount + 1,
      },
    });
  };

  const onRemove = () => {
    void session.executeCommand({
      contractName: 'removeFromCart',
      payload: { id: cartItemId },
    });
  };

  return (
    <div className="flex items-center justify-end gap-1">
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
    </div>
  );
}
