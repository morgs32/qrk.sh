import assert from 'node:assert/strict';

import { replaceServiceProjectionTx } from '@zerospin/browser/replaceServiceProjectionTx';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { applyOperationTx } from '@zerospin/core/contracts/applyOperationTx';
import { makeOperations } from '@zerospin/core/contracts/make/makeOperations';
import { validateServiceCommand } from '@zerospin/core/contracts/validateServiceCommand';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemorySqljsDb/makeProvisionedInMemorySqljsDb';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import type { INodeCommandInput } from '@zerospin/core/Node/types';
import { makeServiceSession } from '@zerospin/core/serviceSession/make/makeServiceSession';
import { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
import { makeServiceSessionLock } from '@zerospin/core/serviceSession/make/makeServiceSessionLock';
import {
  bindServiceSessionExecution,
  stageServiceCommand,
} from '@zerospin/core/serviceSession/stageServiceCommand';
import { makeEffectSchema } from '@zerospin/schema';
import { Context, Effect, Result, Schema } from 'effect';

import { userActorV1 } from '../aggregates/user/actors/userActorV1';
import { ClerkUserIdSchema, userAggregateId, userClaims } from '../claims';
import { catalogActorV1 } from '../services/marketplace/actors/catalogActorV1';
import { shopperActorV1 } from '../services/marketplace/actors/shopperActorV1';
import { addToCartV1 } from '../services/marketplace/contracts/addToCart/AddToCartV1';
import { mappedAddToCartV1 } from '../services/marketplace/contracts/addToCart/mappedAddToCartV1';
import { createCartV1 } from '../services/marketplace/contracts/createCart/CreateCartV1';
import { removeFromCartV1 } from '../services/marketplace/contracts/removeFromCart/RemoveFromCartV1';
import { updateCartItemQuantityV1 } from '../services/marketplace/contracts/updateCartItemQuantity/UpdateCartItemQuantityV1';
import { marketplaceServiceV1 } from '../services/marketplace/marketplaceServiceV1';
import { cartV1 } from '../services/marketplace/models/cart/CartV1';
import { cartItemV1 } from '../services/marketplace/models/cartItem/CartItemV1';
import { productV1 } from '../services/marketplace/models/product/ProductV1';

const models = { cart: cartV1, cartItem: cartItemV1, product: productV1 };
const contracts = {
  createCart: createCartV1,
  addToCart: addToCartV1,
  removeFromCart: removeFromCartV1,
  updateCartItemQuantity: updateCartItemQuantityV1,
};
type ICartContract =
  | (typeof contracts)[keyof typeof contracts]
  | typeof mappedAddToCartV1;
const alice = {
  clerkUserId: Schema.decodeUnknownSync(ClerkUserIdSchema)('user_alice'),
};
const bob = {
  clerkUserId: Schema.decodeUnknownSync(ClerkUserIdSchema)('user_bob'),
};
const base = {
  version: '1.0.0' as const,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};
const product = {
  ...base,
  id: 'prd_one' as const,
  modelName: 'product' as const,
  name: 'Authoritative',
  description: 'Catalog description',
  price: 20,
};
const proposed = {
  ...product,
  name: 'Client supplied',
  description: 'Client description',
  price: 1,
};
const cart = {
  ...base,
  id: 'crt_alice' as const,
  modelName: 'cart' as const,
  userId: alice.clerkUserId,
};
const payload = {
  cartId: cart.id,
  cartItemId: 'cit_one' as const,
  product: proposed,
  amount: 2,
};
const command = (
  contract: ICartContract,
  payload: unknown,
  id: `cmd_${string}` = 'cmd_fixture',
) => ({
  id,
  commandName: contract.commandName,
  contractVersion: contract.version,
  payload,
});

await Effect.runPromise(
  Effect.gen(function* () {
    const config = makeResourceDbConfig({ models, otherTables: {} });
    const local = yield* makeProvisionedInMemorySqljsDb({ dbConfig: config });
    const owner = yield* makeProvisionedInMemorySqljsDb({ dbConfig: config });
    local.insert(config.schema.cart).values(cart).run();
    owner.insert(config.schema.cart).values(cart).run();
    owner.insert(config.schema.product).values(product).run();
    // Owner guard registries erase requirements; these guards require no services.
    const runGuard = Effect.runSyncWith(Context.makeUnsafe<unknown>(new Map()));
    const selected = (name: keyof typeof models, claims = alice) =>
      Schema.decodeUnknownSync(
        Schema.Array(Schema.toType(EncodedResourceSchema)),
      )(shopperActorV1.capturedSelections[name]!.all(owner, claims));
    const collect = (
      db: typeof local,
      contract: ICartContract,
      value: unknown,
      claims = alice,
      id: `cmd_${string}` = 'cmd_fixture',
    ) =>
      Effect.runSync(
        makeOperations({
          db,
          contract,
          models,
          command: command(contract, value, id),
          claims,
        }),
      );
    const apply = (
      db: typeof local,
      contract: ICartContract,
      value: unknown,
      claims = alice,
      authoritative = false,
    ) =>
      db.transaction(tx => {
        if (authoritative) {
          runGuard(
            validateServiceCommand({
              service: marketplaceServiceV1,
              caller: {
                actorName: 'shopper',
                actorVersion: '1.0.0',
                claims,
                nodeId: null,
                nodeIndex: null,
                sessionName: null,
              },
              contract,
              db: tx,
              payload: value,
            }),
          );
        }
        const output = collect(tx, contract, value, claims);
        for (const [operationIndex, operation] of output.operations.entries()) {
          assert.notEqual(operation.operationName, 'async');
          Effect.runSync(
            applyOperationTx({
              tx,
              operation,
              commandId: 'cmd_fixture',
              operationIndex,
              appliedAt: new Date(1),
            }),
          );
        }
        return output;
      });
    const staged = apply(local, addToCartV1, payload);
    assert.deepEqual(
      staged.operations.map(op => [op.operationName, op.model.modelName]),
      [
        ['create', 'product'],
        ['create', 'cartItem'],
      ],
    );
    assert.equal(local.query.product.findFirst().sync()?.name, proposed.name);
    assert.equal(
      local.query.cartItem
        .findFirst({ with: { product: true, cart: true } })
        .sync()?.product.price,
      1,
    );
    assert.throws(() =>
      apply(local, addToCartV1, {
        ...payload,
        product: { ...proposed, id: 'prd_rolled_back' },
      }),
    );
    assert.equal(
      local.query.product
        .findFirst({ where: { id: { eq: 'prd_rolled_back' } } })
        .sync(),
      undefined,
    );
    const existing = collect(local, addToCartV1, {
      ...payload,
      cartItemId: 'cit_second',
    });
    assert.equal(existing.operations.length, 1);
    assert.equal(local.query.product.findFirst().sync()?.name, proposed.name);
    assert.equal(mappedAddToCartV1.mapping.original, addToCartV1);
    assert.equal(marketplaceServiceV1.contracts.addToCart, mappedAddToCartV1);
    assert.equal(shopperActorV1.contracts.addToCart, mappedAddToCartV1);
    const success = apply(owner, mappedAddToCartV1, payload, alice, true);
    assert.equal(success.operations.length, 1);
    assert.equal(success.encodedResult, null);
    assert.equal(owner.query.product.findFirst().sync()?.name, product.name);
    assert.equal(owner.query.product.findFirst().sync()?.price, 20);
    assert.equal(
      owner.query.product.findFirst().sync()?.description,
      product.description,
    );
    const missing = {
      ...payload,
      cartItemId: 'cit_missing',
      product: { ...proposed, id: 'prd_missing' },
    };
    assert.equal(collect(local, addToCartV1, missing).operations.length, 2);
    assert.throws(
      () => apply(owner, mappedAddToCartV1, missing, alice, true),
      /catalog product no longer exists/,
    );
    assert.equal(
      owner.query.product
        .findFirst({ where: { id: { eq: 'prd_missing' } } })
        .sync(),
      undefined,
    );
    assert.equal(
      owner.query.cartItem
        .findFirst({ where: { id: { eq: 'cit_missing' } } })
        .sync(),
      undefined,
    );
    assert.equal(owner.query.cartItem.findMany().sync().length, 1);
    assert.throws(() => apply(owner, mappedAddToCartV1, payload, alice, true));
    assert.equal(owner.query.cartItem.findMany().sync().length, 1);

    // Authoritative actor guards independently deny every cross-user cart command.
    const denialCases = [
      {
        contract: createCartV1,
        value: { id: 'crt_forged', userId: alice.clerkUserId },
      },
      {
        contract: mappedAddToCartV1,
        value: { ...payload, cartItemId: 'cit_forged' },
      },
      { contract: removeFromCartV1, value: { id: 'cit_one' } },
      {
        contract: updateCartItemQuantityV1,
        value: { cartItemId: 'cit_one', amount: 99 },
      },
    ];
    for (const { contract, value } of denialCases) {
      const denied = runGuard(
        validateServiceCommand({
          service: marketplaceServiceV1,
          caller: {
            actorName: 'shopper',
            actorVersion: '1.0.0',
            claims: bob,
            nodeId: null,
            nodeIndex: null,
            sessionName: null,
          },
          contract,
          db: owner,
          payload: value,
        }).pipe(Effect.result),
      );
      assert.ok(Result.isFailure(denied));
      assert.equal(denied.failure.code, 'actor-denied');
      assert.throws(() =>
        collect(
          owner,
          contract === mappedAddToCartV1 ? addToCartV1 : contract,
          value,
          bob,
        ),
      );
    }
    assert.deepEqual(catalogActorV1.contracts, {});
    const forbidden = runGuard(
      validateServiceCommand({
        service: marketplaceServiceV1,
        caller: {
          actorName: 'catalog',
          actorVersion: '1.0.0',
          claims: alice,
          nodeId: null,
          nodeIndex: null,
          sessionName: null,
        },
        contract: mappedAddToCartV1,
        db: owner,
        payload,
      }).pipe(Effect.result),
    );
    assert.ok(Result.isFailure(forbidden));
    assert.equal(forbidden.failure.code, 'service-command-actor-forbidden');
    apply(
      owner,
      createCartV1,
      { id: 'crt_bob', userId: bob.clerkUserId },
      bob,
      true,
    );
    apply(
      owner,
      mappedAddToCartV1,
      { ...payload, cartId: 'crt_bob', cartItemId: 'cit_bob' },
      bob,
      true,
    );
    assert.throws(() =>
      apply(
        owner,
        createCartV1,
        { id: 'crt_duplicate', userId: alice.clerkUserId },
        alice,
        true,
      ),
    );
    assert.throws(() =>
      owner
        .insert(config.schema.cart)
        .values({ ...cart, id: 'crt_duplicate' })
        .run(),
    );
    for (const [claims, cartId, itemId] of [
      [alice, 'crt_alice', 'cit_one'],
      [bob, 'crt_bob', 'cit_bob'],
    ] as const) {
      assert.deepEqual(
        selected('cart', claims).map(row => row.id),
        [cartId],
      );
      assert.deepEqual(
        selected('cartItem', claims).map(row => row.id),
        [itemId],
      );
      assert.deepEqual(
        selected('product', claims).map(row => row.id),
        ['prd_one'],
      );
    }
    assert.deepEqual(
      Schema.decodeUnknownSync(
        Schema.Array(Schema.toType(EncodedResourceSchema)),
      )(catalogActorV1.capturedSelections.product!.all(owner, alice)).map(
        row => row.id,
      ),
      ['prd_one'],
    );
    apply(
      owner,
      updateCartItemQuantityV1,
      { cartItemId: 'cit_one', amount: 3 },
      alice,
      true,
    );
    assert.equal(
      owner.query.cartItem
        .findFirst({ where: { id: { eq: 'cit_one' } } })
        .sync()?.amount,
      3,
    );

    // Exercise the production replacement/rebase seam without acquiring a browser.
    const input = (id: `cmd_${string}`, value: unknown): INodeCommandInput => ({
      id,
      commandName: 'addToCart',
      payload: JSON.stringify(
        Schema.encodeUnknownSync(makeEffectSchema(addToCartV1.payload))(value),
      ),
      contractVersion: '1.0.0',
      targetId: '',
      targetName: 'marketplace',
      actorName: 'shopper',
      actorVersion: '1.0.0',
      sessionName: 'shopperSession',
      claims: alice,
      staging: {
        result: null,
        startedAt: new Date(0).toISOString(),
        completedAt: new Date(1).toISOString(),
        stagedDelta: { inserted: [], updated: [], deleted: [], operations: [] },
      },
    });
    const resources = (): IEncodedResourceShape[] =>
      (['cart', 'cartItem', 'product'] as const).flatMap(name =>
        Schema.decodeUnknownSync(
          Schema.Array(Schema.toType(EncodedResourceSchema)),
        )(shopperActorV1.capturedSelections[name]!.all(owner, alice)),
      );
    const replace = (pending: readonly INodeCommandInput[]) =>
      local.transaction(tx =>
        replaceServiceProjectionTx(tx, {
          models,
          resources: resources(),
          pending,
          predict: command =>
            collect(
              tx,
              addToCartV1,
              Schema.decodeUnknownSync(
                Schema.fromJsonString(makeEffectSchema(addToCartV1.payload)),
              )(command.payload),
              alice,
              command.id,
            ).operations,
        }),
      );
    replace([]);
    assert.equal(local.query.product.findMany().sync().length, 1);
    assert.equal(local.query.product.findFirst().sync()?.name, product.name);
    assert.equal(
      local.query.cartItem.findFirst({ with: { product: true } }).sync()
        ?.product.price,
      20,
    );
    // Rejection clears the prediction; an unresolved second command rebases over authoritative rows.
    apply(local, addToCartV1, missing);
    replace([
      input('cmd_application_failure', { ...missing, cartItemId: 'cit_one' }),
      input('cmd_pending', { ...payload, cartItemId: 'cit_pending' }),
    ]);
    assert.equal(
      local.query.product
        .findFirst({ where: { id: { eq: 'prd_missing' } } })
        .sync(),
      undefined,
    );
    assert.equal(
      local.query.cartItem
        .findFirst({ where: { id: { eq: 'cit_missing' } } })
        .sync(),
      undefined,
    );
    assert.equal(local.query.cartItem.findMany().sync().length, 2);
    assert.equal(local.query.product.findMany().sync().length, 1);
    assert.equal(local.query.product.findFirst().sync()?.name, product.name);
    // Removing the last reference deselects its product without deleting the owner's catalog row.
    apply(owner, removeFromCartV1, { id: 'cit_one' }, alice, true);
    assert.equal(selected('product', alice).length, 0);
    assert.equal(owner.query.product.findMany().sync().length, 1);
    assert.equal(selected('product', bob).length, 1);
    replace([]);
    assert.equal(local.query.cartItem.findMany().sync().length, 0);
    assert.equal(local.query.product.findMany().sync().length, 0);
    // A pending add recreates selected product optimism after the last reference disappeared.
    replace([
      input('cmd_after_removal', {
        ...payload,
        cartItemId: 'cit_after_removal',
      }),
    ]);
    assert.equal(local.query.cartItem.findMany().sync().length, 1);
    assert.equal(local.query.product.findMany().sync().length, 1);
    // Rebase failure rolls back only its own emissions; subsequent pending work survives.
    replace([
      input('cmd_invalid', { ...missing, cartId: 'crt_bob' }),
      input('cmd_valid', { ...payload, cartItemId: 'cit_valid' }),
    ]);
    assert.equal(local.query.cartItem.findMany().sync().length, 1);
    assert.equal(
      local.query.product
        .findFirst({ where: { id: { eq: 'prd_missing' } } })
        .sync(),
      undefined,
    );
    replace([]);
    assert.equal(local.query.product.findMany().sync().length, 0);

    assert.equal(userAggregateId(alice.clerkUserId), 'acct_user_alice');
    assert.notEqual(
      userAggregateId(alice.clerkUserId),
      userAggregateId(bob.clerkUserId),
    );
    assert.deepEqual(userActorV1.contracts, {});
    assert.notEqual(userActorV1.authentication, 'system');
    const authorize = userActorV1.authorize!;
    const claims = {
      ...alice,
      aggregateId: userAggregateId(alice.clerkUserId),
    };
    yield* authorize({
      claims,
      aggregateId: claims.aggregateId,
      sessionName: 'user',
      db: owner,
    });
    for (const mismatch of [
      { claims, aggregateId: userAggregateId(bob.clerkUserId) },
      {
        claims: { ...claims, aggregateId: userAggregateId(bob.clerkUserId) },
        aggregateId: userAggregateId(bob.clerkUserId),
      },
    ]) {
      const denied = yield* authorize({
        ...mismatch,
        sessionName: 'user',
        db: owner,
      }).pipe(Effect.result);
      assert.ok(Result.isFailure(denied));
      assert.equal(denied.failure.code, 'user-aggregate-identity-mismatch');
    }

    const authored = makeServiceSessionDefinition({
      actorName: 'shopper',
      actorVersion: '1.0.0',
      serviceName: 'marketplace',
      serviceVersion: '1.0.0',
      sessionName: 'shopperSession',
      claimsSchema: userClaims,
      contracts,
      models,
    });
    const definition = { ...authored, contracts };
    const lock = makeServiceSessionLock(definition);
    assert.deepEqual(
      lock.contracts.addToCart?.resultJsonSchema,
      addToCartV1.spec.resultJsonSchema,
    );
    const session = makeServiceSession({
      definition: { ...definition, systemName: 'shopping' },
      models,
    });
    let resolveAcceptance:
      | ((result: { _tag: 'Success'; success: INodeCommandInput }) => void)
      | undefined;
    const unbind = bindServiceSessionExecution(session, {
      can: () => ({ _tag: 'Success', success: undefined }),
      stage: () =>
        new Promise(resolve => {
          resolveAcceptance = resolve;
        }),
    });
    let completed = false;
    const stagedPromise = stageServiceCommand({
      session,
      contractName: 'addToCart',
      payload,
    }).then(result => {
      completed = true;
      return result;
    });
    yield* Effect.promise(() => Promise.resolve());
    assert.equal(completed, false);
    resolveAcceptance!({
      _tag: 'Success',
      success: input('cmd_durable', payload),
    });
    const durable = yield* Effect.promise(() => stagedPromise);
    assert.equal(durable._tag, 'Success');
    unbind();
    assert.equal(
      (yield* Effect.promise(() =>
        stageServiceCommand({ session, contractName: 'addToCart', payload }),
      ))._tag,
      'Failure',
    );
  }).pipe(Effect.provide(AsyncLive)),
);
console.log(
  'Shopping marketplace staging, mapping, rollback, isolation, reconciliation, rebase and per-user authorization passed',
);
