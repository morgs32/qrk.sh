/* oxlint-disable eslint/no-restricted-imports -- Test-only decoration executes Shopping's real administrative delivery layer. */
import { env } from 'cloudflare:workers';
import { Effect, Layer } from 'effect';

import { ShoppingPurchaseDelivery } from '../../src/zerospin/ShoppingPurchaseDelivery';
import { ShoppingPurchaseDeliveryLive as ProductionShoppingPurchaseDeliveryLive } from '../../src/zerospin/ShoppingPurchaseDeliveryLive';

export const ShoppingPurchaseDeliveryLive = Layer.effect(
  ShoppingPurchaseDelivery,
  Effect.gen(function* () {
    const actual = yield* ShoppingPurchaseDelivery;
    return {
      deliver: input =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            env.SHOPPING_TEST_PROVIDER.getByName('shopping').beforeTransfer(
              input,
            ),
          );
          yield* actual.deliver(input);
          yield* Effect.promise(() =>
            env.SHOPPING_TEST_PROVIDER.getByName('shopping').afterTransfer(
              input,
            ),
          );
        }),
    } satisfies typeof ShoppingPurchaseDelivery.Service;
  }),
).pipe(Layer.provide(ProductionShoppingPurchaseDeliveryLive));
