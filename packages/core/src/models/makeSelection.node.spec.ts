import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeMigratedInMemoryWasmSqliteDb } from '../drizzle/makeMigratedInMemoryWasmSqliteDb.ts';

import { makeModel } from './makeModel.ts';
import { applySelection, makeSelection } from './makeSelection.ts';
import { primitives } from './primitives.ts';

const User = makeModel(
  {
    abbreviation: 'usr',
    modelName: 'user',
    attributes: {
      actorId: primitives.opaqueId({ abbreviation: 'actr', unique: true }),
      name: primitives.text({ nullable: true }),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const Cart = makeModel(
  {
    abbreviation: 'crt',
    modelName: 'cart',
    attributes: {
      userId: primitives.ref({
        table: User.table,
        relation: 'user',
        inverse: 'cart',
        unique: true,
      }),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const Product = makeModel(
  {
    abbreviation: 'prd',
    modelName: 'product',
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const CartItem = makeModel(
  {
    abbreviation: 'cit',
    modelName: 'cartItem',
    attributes: {
      cartId: primitives.ref({
        table: Cart.table,
        relation: 'cart',
        inverse: 'items',
      }),
      productId: primitives.ref({
        table: Product.table,
        relation: 'product',
        inverse: 'cartItems',
      }),
      quantity: primitives.integer(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const testActorId = 'actr_selectionspec01' as const;
const testUserId = 'usr_selectionspec001' as const;
const testCartId = 'crt_selectionspec001' as const;
const testItemId = 'cit_selectionspec001' as const;
const testProductId = 'prd_selectionspec001' as const;

describe('makeSelection', () => {
  it('defaults where to select-all when omitted', () => {
    const selection = makeSelection({ model: User });

    expect(selection.where({ actorId: testActorId })).toEqual({});
  });

  it.effect('applies forward-ref joins and filters by nested user fields', () =>
    Effect.gen(function* () {
      const models = {
        cart: Cart,
        cartItem: CartItem,
        product: Product,
        user: User,
      };
      const dbConfig = makeResourceDbConfig({ models });
      const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

      const now = new Date('2020-01-01T00:00:00.000Z');

      db.insert(User.drizzleSchema)
        .values({
          id: testUserId,
          modelName: User.modelName,
          createdAt: now,
          updatedAt: now,
          version: User.version,
          actorId: testActorId,
          name: 'Ada',
        })
        .run();

      db.insert(Cart.drizzleSchema)
        .values({
          id: testCartId,
          modelName: Cart.modelName,
          createdAt: now,
          updatedAt: now,
          version: Cart.version,
          userId: testUserId,
        })
        .run();

      db.insert(CartItem.drizzleSchema)
        .values({
          id: testItemId,
          modelName: CartItem.modelName,
          createdAt: now,
          updatedAt: now,
          version: CartItem.version,
          cartId: testCartId,
          productId: testProductId,
          quantity: 2,
        })
        .run();

      db.insert(Product.drizzleSchema)
        .values({
          id: testProductId,
          modelName: Product.modelName,
          createdAt: now,
          updatedAt: now,
          version: Product.version,
          name: 'Product',
        })
        .run();

      const selection = makeSelection({
        model: CartItem,
        where: ({ actorId }) => ({
          cart: {
            user: {
              actorId,
            },
          },
        }),
      });

      const query = applySelection({
        db,
        models,
        selection,
        actorId: testActorId,
      });
      const { sql } = query.toSQL();

      expect(sql.toLowerCase()).toContain('join');
      expect(sql.toLowerCase()).toContain('cart');
      expect(sql.toLowerCase()).toContain('user');
      const rows = query.all() as Array<{ id: string; quantity: number }>;
      expect(rows).toEqual([
        expect.objectContaining({
          id: testItemId,
          quantity: 2,
        }),
      ]);

      db.insert(CartItem.drizzleSchema)
        .values({
          id: 'cit_selectionspec002',
          modelName: CartItem.modelName,
          createdAt: now,
          updatedAt: now,
          version: CartItem.version,
          cartId: testCartId,
          productId: testProductId,
          quantity: 1,
        })
        .run();
      const productRows = applySelection({
        db,
        models,
        selection: makeSelection({
          model: Product,
          where: ({ actorId }) => ({
            cartItems: { cart: { user: { actorId } } },
          }),
        }),
        actorId: testActorId,
      }).all();
      expect(productRows).toHaveLength(1);
      expect(productRows[0]).toEqual(
        expect.objectContaining({ id: testProductId }),
      );
    }).pipe(Effect.provide(AsyncLive)),
  );
});
