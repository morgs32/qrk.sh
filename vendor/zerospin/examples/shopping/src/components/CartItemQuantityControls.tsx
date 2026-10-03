import type { InferResource } from '@zerospin/core/models/types';
import { stageServiceCommand } from '@zerospin/react';
import { Minus, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useCartCommand } from '@/hooks/useCartCommand';
import { type cartItemV1 } from '@/zerospin/services/marketplace/models/cartItem/CartItemV1';
import { shopperSession } from '@/zerospin/shopperSession';

interface IProps {
  cartItemId: InferResource<typeof cartItemV1>['id'];
  amount: number;
}

export function CartItemQuantityControls({ amount, cartItemId }: IProps) {
  const { pending, error, submit } = useCartCommand();
  const removeFailure =
    shopperSession.can({
      contractName: 'removeFromCart',
      payload: { id: cartItemId },
    })._tag === 'Failure';
  const quantityFailure = (nextAmount: number) =>
    shopperSession.can({
      contractName: 'updateCartItemQuantity',
      payload: { cartItemId, amount: nextAmount },
    })._tag === 'Failure';
  const remove = () =>
    void submit(async record => {
      const result = await stageServiceCommand({
        session: shopperSession,
        contractName: 'removeFromCart',
        payload: { id: cartItemId },
      });
      if (result._tag === 'Failure') throw result.failure;
      record(result.success.id);
    });
  const quantity = (amount: number) =>
    void submit(async record => {
      const result = await stageServiceCommand({
        session: shopperSession,
        contractName: 'updateCartItemQuantity',
        payload: { cartItemId, amount },
      });
      if (result._tag === 'Failure') throw result.failure;
      record(result.success.id);
    });

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Button
        disabled={
          pending || (amount <= 1 ? removeFailure : quantityFailure(amount - 1))
        }
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => (amount <= 1 ? remove() : quantity(amount - 1))}
      >
        <Minus className="h-3 w-3" />
      </Button>
      <span className="min-w-[2rem] text-center text-sm font-medium">
        {amount}
      </span>
      <Button
        disabled={pending || quantityFailure(amount + 1)}
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => quantity(amount + 1)}
      >
        <Plus className="h-3 w-3" />
      </Button>
      <Button
        disabled={pending || removeFailure}
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        onClick={remove}
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
