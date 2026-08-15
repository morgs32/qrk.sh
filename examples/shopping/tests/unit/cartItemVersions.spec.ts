import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { updateCartItemQuantity } from '../../src/zerospin/contracts';
import { CartItem } from '../../src/zerospin/models';

describe('CartItem protocol versions', () => {
  it('up-adapts the V1 quantity command into the current amount and unit payload', async () => {
    const payload = await Effect.runPromise(
      updateCartItemQuantity.decodeAndAdaptPayload({
        command: {
          id: 'cmd_cart_item_quantity_v1',
          commandName: 'updateCartItemQuantity',
          contractVersion: '1.0.0',
          payload: JSON.stringify({
            cartItemId: 'cit_cart_item',
            quantity: 24,
          }),
        },
      }),
    );

    expect(payload).toEqual({
      cartItemId: 'cit_cart_item',
      amount: 24,
      unit: 'item',
    });
  });

  it('down-adapts the current case resource into the exact V1 quantity resource', () => {
    const createdAt = new Date('2026-08-05T12:00:00.000Z');
    const updatedAt = new Date('2026-08-05T13:00:00.000Z');

    expect(
      Effect.runSync(
        CartItem.adaptResource({
          version: '1.0.0',
          resource: {
            id: 'cit_cart_item',
            modelName: 'cartItem',
            createdAt,
            updatedAt,
            version: '2.0.0',
            amount: 2,
            unit: 'case',
            cartId: 'crt_cart',
            productId: 'prd_product',
          },
        }),
      ),
    ).toEqual({
      id: 'cit_cart_item',
      modelName: 'cartItem',
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      version: '1.0.0',
      cartId: 'crt_cart',
      productId: 'prd_product',
      quantity: 24,
    });
  });
});
