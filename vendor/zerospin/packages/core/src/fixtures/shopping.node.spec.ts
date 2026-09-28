import { it } from '@effect/vitest';
import { Cause, Effect, Exit } from 'effect';
import { expect } from 'vitest';

import { makeMutations } from '../contracts/make/makeMutations.ts';

import {
  addItem,
  cart,
  cartItem,
  changeQuantity,
  definition,
  removeItem,
} from './shopping.ts';

it.effect(
  'declares one cart model and produces add, quantity-change, and removal mutations',
  () =>
    Effect.gen(function* () {
      expect(cart.models).toEqual({ cartItem });
      expect(definition.lock.models.cartItem?.propertiesShape).toEqual(
        cartItem.spec.propertiesShape,
      );
      const added = yield* makeMutations({
        contract: addItem,
        models: cart.models,
        command: {
          id: 'cmd_add',
          commandName: addItem.commandName,
          contractVersion: addItem.version,
          payload: { id: 'cit_one', productId: 'product_one', quantity: 2 },
        },
        claims: definition.identity.claims,
      });
      expect(added.mutations).toMatchObject([
        {
          model: cartItem,
          resourceId: 'cit_one',
          operationName: 'create',
          operation: { attributes: { productId: 'product_one', quantity: 2 } },
        },
      ]);
      const changed = yield* makeMutations({
        contract: changeQuantity,
        models: cart.models,
        command: {
          id: 'cmd_change',
          commandName: changeQuantity.commandName,
          contractVersion: changeQuantity.version,
          payload: { id: 'cit_one', quantity: 3 },
        },
        claims: definition.identity.claims,
      });
      expect(changed.mutations).toMatchObject([
        {
          model: cartItem,
          resourceId: 'cit_one',
          operationName: 'update',
          operation: { attributes: { quantity: 3 } },
        },
      ]);
      const removed = yield* makeMutations({
        contract: removeItem,
        models: cart.models,
        command: {
          id: 'cmd_remove',
          commandName: removeItem.commandName,
          contractVersion: removeItem.version,
          payload: { id: 'cit_one' },
        },
        claims: definition.identity.claims,
      });
      expect(removed.mutations).toMatchObject([
        {
          model: cartItem,
          resourceId: 'cit_one',
          operationName: 'delete',
        },
      ]);
    }),
);

it.effect(
  'rejects non-positive or fractional quantities before returning cart mutations',
  () =>
    Effect.gen(function* () {
      for (const contract of [addItem, changeQuantity]) {
        for (const quantity of [0, -1, 1.5]) {
          const result = yield* Effect.exit(
            makeMutations({
              contract,
              models: cart.models,
              command: {
                id: 'cmd_invalid',
                commandName: contract.commandName,
                contractVersion: contract.version,
                payload:
                  contract === addItem
                    ? { id: 'cit_one', productId: 'product_one', quantity }
                    : { id: 'cit_one', quantity },
              },
              claims: definition.identity.claims,
            }),
          );
          expect(result).toMatchObject({ _tag: 'Failure' });
          if (Exit.isFailure(result)) {
            expect(Cause.squash(result.cause)).toMatchObject({
              code: 'invalid-quantity',
            });
          }
        }
      }
    }),
);
