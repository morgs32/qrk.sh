import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { primitives } from '@zerospin/schema';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeProvisionedInMemoryWasmSqliteDb } from '../drizzle/makeProvisionedInMemoryWasmSqliteDb.ts';

import { Model } from './makeModel.ts';
import { makeReplica } from './makeReplica.ts';
import { applySelection, makeSelection } from './makeSelection.ts';

import { models as modelDefinitions } from './index.ts';

const User = modelDefinitions.makeVersion(
  modelDefinitions.makeModel({ name: 'user', abbreviation: 'usr' }),
  {
    attributes: {
      name: primitives.text({ nullable: true }),
    },
    indexes: [],
    version: '1.0.0',
  },
);

const Cart = modelDefinitions.makeVersion(
  modelDefinitions.makeModel({ name: 'cart', abbreviation: 'crt' }),
  {
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
);

const Product = modelDefinitions.makeVersion(
  modelDefinitions.makeModel({ name: 'product', abbreviation: 'prd' }),
  {
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
);

const CartItem = modelDefinitions.makeVersion(
  modelDefinitions.makeModel({ name: 'cartItem', abbreviation: 'cit' }),
  {
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
);

const testUserId = 'usr_selectionspec001' as const;
const testCartId = 'crt_selectionspec001' as const;
const testItemId = 'cit_selectionspec001' as const;
const testProductId = 'prd_selectionspec001' as const;

describe('makeSelection', () => {
  it('defaults where to select-all when omitted', () => {
    const selection = makeSelection({ model: User });

    expect(selection.where({ userId: testUserId })).toEqual({});
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
      const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });

      const now = new Date('2020-01-01T00:00:00.000Z');

      db.insert(dbConfig.schema.user)
        .values({
          id: testUserId,
          modelName: User.modelName,
          createdAt: now,
          updatedAt: now,
          version: User.version,
          name: 'Ada',
        })
        .run();

      db.insert(dbConfig.schema.cart)
        .values({
          id: testCartId,
          modelName: Cart.modelName,
          createdAt: now,
          updatedAt: now,
          version: Cart.version,
          userId: testUserId,
        })
        .run();

      db.insert(dbConfig.schema.product)
        .values({
          id: testProductId,
          modelName: Product.modelName,
          createdAt: now,
          updatedAt: now,
          version: Product.version,
          name: 'Product',
        })
        .run();

      db.insert(dbConfig.schema.cartItem)
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

      const selection = makeSelection({
        model: CartItem,
        where: ({ userId }) => ({
          cart: {
            user: {
              id: userId,
            },
          },
        }),
      });

      const query = applySelection({
        db,
        models,
        selection,
        userId: testUserId,
        where: undefined,
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

      db.insert(dbConfig.schema.cartItem)
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
          where: ({ userId }) => ({
            cartItems: { cart: { user: { id: userId } } },
          }),
        }),
        userId: testUserId,
        where: undefined,
      }).all();
      expect(productRows).toHaveLength(1);
      expect(productRows[0]).toEqual(
        expect.objectContaining({ id: testProductId }),
      );
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'selects through exact authoritative source-table refs between replicas',
    () =>
      Effect.gen(function* () {
        const ProductSelectionSource = modelDefinitions.makeVersion(
          modelDefinitions.makeModel({
            name: 'selectionProduct',
            abbreviation: 'sprd',
          }),
          {
            attributes: { name: primitives.text() },
            indexes: [],
            version: '1.0.0',
          },
        );
        const CartItemSelectionSource = modelDefinitions.makeVersion(
          modelDefinitions.makeModel({
            name: 'selectionCartItem',
            abbreviation: 'scit',
          }),
          {
            attributes: {
              productId: primitives.ref({
                table: ProductSelectionSource.table,
                relation: 'product',
                inverse: 'cartItems',
              }),
              quantity: primitives.integer(),
            },
            indexes: [],
            version: '1.0.0',
          },
        );
        const ProductReplica = makeReplica({
          sourceModel: ProductSelectionSource,
          modelVersion: ProductSelectionSource.version,
          serviceName: 'catalog',
        });
        const CartItemReplica = makeReplica({
          sourceModel: CartItemSelectionSource,
          modelVersion: CartItemSelectionSource.version,
          serviceName: 'catalog',
        });
        const models = {
          selectionCartItem: CartItemReplica,
          selectionProduct: ProductReplica,
        };
        const dbConfig = makeResourceDbConfig({ models });
        const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
        const now = new Date('2026-08-30T00:00:00.000Z');

        db.insert(dbConfig.schema.selectionProduct)
          .values({
            id: 'sprd_selectionspec001',
            modelName: ProductReplica.modelName,
            createdAt: now,
            updatedAt: now,
            version: ProductReplica.version,
            name: 'Replica product',
            deletedAt: null,
          })
          .run();
        db.insert(dbConfig.schema.selectionCartItem)
          .values({
            id: 'scit_selectionspec001',
            modelName: CartItemReplica.modelName,
            createdAt: now,
            updatedAt: now,
            version: CartItemReplica.version,
            productId: 'sprd_selectionspec001',
            quantity: 2,
            deletedAt: null,
          })
          .run();

        const cartItems = applySelection({
          db,
          models,
          selection: makeSelection({
            model: CartItemReplica,
            where: () => ({ product: { name: 'Replica product' } }),
          }),
          userId: testUserId,
          where: undefined,
        }).all();
        const products = applySelection({
          db,
          models,
          selection: makeSelection({
            model: ProductReplica,
            where: () => ({ cartItems: { quantity: 2 } }),
          }),
          userId: testUserId,
          where: undefined,
        }).all();

        expect(cartItems).toEqual([
          expect.objectContaining({ id: 'scit_selectionspec001' }),
        ]);
        expect(products).toEqual([
          expect.objectContaining({ id: 'sprd_selectionspec001' }),
        ]);

        const DerivedProduct = {
          ...ProductReplica,
          sourceModel: ProductReplica.sourceModel,
          serviceName: ProductReplica.serviceName,
        };
        const DerivedCartItem = {
          ...CartItemReplica,
          sourceModel: CartItemReplica.sourceModel,
          serviceName: CartItemReplica.serviceName,
        };
        const derivedModels = {
          selectionCartItem: DerivedCartItem,
          selectionProduct: DerivedProduct,
        };

        expect(Model.isReplica(DerivedProduct)).toBe(false);
        expect(
          applySelection({
            db,
            models: derivedModels,
            selection: makeSelection({
              model: DerivedProduct,
              where: () => ({ cartItems: { quantity: 2 } }),
            }),
            userId: testUserId,
            where: undefined,
          }).all(),
        ).toEqual([expect.objectContaining({ id: 'sprd_selectionspec001' })]);
      }).pipe(Effect.provide(AsyncLive)),
  );
});
