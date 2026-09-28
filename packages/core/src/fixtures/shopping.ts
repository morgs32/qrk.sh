import { ContractError } from '@zerospin/error';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { defineAggregate } from '../aggregate/defineAggregate.ts';
import { makeAggregateVersion } from '../aggregate/make/makeAggregateVersion.ts';
import { makeAggregateSessionLock } from '../aggregateSession/make/makeAggregateSessionLock.ts';
import { defineContract } from '../contracts/defineContract.ts';
import { makeContractVersion } from '../contracts/make/makeContractVersion.ts';
import { defineModel } from '../models/defineModel.ts';
import { makeModelVersion } from '../models/make/makeModelVersion.ts';
import type { INodeDefinition } from '../Node/types.ts';

/** A small shared cart example; runtime-specific harnesses live separately. */
export const cartItem = makeModelVersion(
  defineModel({ name: 'cartItem', abbreviation: 'cit' }),
  {
    version: '1.0.0',
    attributes: {
      productId: primitives.text(),
      quantity: primitives.integer(),
    },
    indexes: [],
  },
);

export const addItem = makeContractVersion(defineContract('addItem'), {
  version: '1.0.0',
  models: { cartItem },
  payload: {
    id: primitives.foreignKey({ abbreviation: 'cit' }),
    productId: primitives.text(),
    quantity: primitives.integer(),
  },
  failures: {
    invalidQuantity: ContractError.schema({ code: 'invalid-quantity' }),
  },
  program: Effect.fn('shopping.addItem')(function* ({
    payload,
    models,
    failures,
  }) {
    if (!Number.isSafeInteger(payload.quantity) || payload.quantity <= 0) {
      return yield* failures.invalidQuantity.make();
    }
    return [
      yield* models.cartItem.create({
        resourceId: payload.id,
        attributes: {
          productId: payload.productId,
          quantity: payload.quantity,
        },
      }),
    ];
  }),
});

export const changeQuantity = makeContractVersion(
  defineContract('changeQuantity'),
  {
    version: '1.0.0',
    models: { cartItem },
    payload: {
      id: primitives.foreignKey({ abbreviation: 'cit' }),
      quantity: primitives.integer(),
    },
    failures: {
      invalidQuantity: ContractError.schema({ code: 'invalid-quantity' }),
    },
    program: Effect.fn('shopping.changeQuantity')(function* ({
      payload,
      models,
      failures,
    }) {
      if (!Number.isSafeInteger(payload.quantity) || payload.quantity <= 0) {
        return yield* failures.invalidQuantity.make();
      }
      return [
        yield* models.cartItem.update({
          resourceId: payload.id,
          attributes: { quantity: payload.quantity },
        }),
      ];
    }),
  },
);

export const removeItem = makeContractVersion(defineContract('removeItem'), {
  version: '1.0.0',
  models: { cartItem },
  payload: { id: primitives.foreignKey({ abbreviation: 'cit' }) },
  program: Effect.fn('shopping.removeItem')(function* ({ payload, models }) {
    return [yield* models.cartItem.delete({ resourceId: payload.id })];
  }),
});

export const cart = makeAggregateVersion(defineAggregate({ name: 'cart' }), {
  version: '1.0.0',
  models: { cartItem },
  contracts: { addItem, changeQuantity, removeItem },
  actors: {},
});

export const definition: INodeDefinition = {
  identity: {
    apiUrl: 'https://api.example.test',
    publishableKey: 'public',
    systemName: 'shopping',
    kind: 'aggregate',
    targetName: cart.name,
    targetVersion: cart.version,
    targetId: 'cart_test',
    actorName: 'shopper',
    actorVersion: '1.0.0',
    sessionName: 'cart',
    claims: { userId: 'one' },
    definitionHash: 'a'.repeat(64),
  },
  lock: makeAggregateSessionLock({
    kind: 'aggregate',
    aggregateName: cart.name,
    aggregateVersion: cart.version,
    actorName: 'shopper',
    actorVersion: '1.0.0',
    sessionName: 'cart',
    claimsSchema: Schema.Struct({ userId: Schema.String }),
    models: cart.models,
    modelNames: Object.keys(cart.models),
    contracts: cart.contracts,
  }),
};
