'use client';

import type { InferResource } from '@zerospin/core/models/types';
import { useSession } from '@zerospin/react/useSession';
import { Minus, Plus, Trash2 } from 'lucide-react';

import { ZerospinShopper } from './ZerospinShopper';

import { Button } from '@/components/ui/button';
import { type CartItem } from '@/zerospin/models';

interface IProps {
  cartItemId: InferResource<typeof CartItem>['id'];
  quantity: number;
}

export function CartItemQuantityControls({ cartItemId, quantity }: IProps) {
  const session = useSession(ZerospinShopper);

  const onDecrement = () => {
    if (quantity <= 1) {
      void session.stageCommand({
        contractName: 'removeFromCart',
        payload: { id: cartItemId },
      });
      return;
    }
    void session.stageCommand({
      contractName: 'updateCartItemQuantity',
      payload: {
        id: cartItemId,
        quantity: quantity - 1,
      },
    });
  };

  const onIncrement = () => {
    void session.stageCommand({
      contractName: 'updateCartItemQuantity',
      payload: {
        id: cartItemId,
        quantity: quantity + 1,
      },
    });
  };

  const onRemove = () => {
    void session.stageCommand({
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
        {quantity}
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
