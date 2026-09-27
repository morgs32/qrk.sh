import { defineContract } from '@zerospin/core/contracts/defineContract';
import {
  makeContractVersion,
  upgradeContractVersion,
} from '@zerospin/core/contracts/make/makeContractVersion';
import { Effect } from 'effect';

/**
 * Write `upgradeContractVersion` payload `up` and `down` as named `Effect.fn`
 * generators. Return the next payload from the generator. Specs, typechecks,
 * and other fixtures use the same shape — do not keep arrow + `Effect.succeed`
 * wrappers in tests.
 *
 * @bad `up: ({ payload }) => Effect.succeed(...)`.
 * @bad `down: ({ payload }) => { ... return Effect.succeed(rest); }`.
 * @bad Spec or typecheck fixture that keeps arrow + `Effect.succeed` edges.
 */

export const addToCartV1 = makeContractVersion(defineContract('addToCart'), {
  payloadSchema: AddToCartV1PayloadSchema,
  program: () => Effect.succeed({}),
});

export const addToCartV2 = upgradeContractVersion(addToCartV1, {
  payload: {
    amount: integerDescriptor,
  },
  up: Effect.fn('addToCartV2.up')(function* ({ payload }) {
    return { ...payload, amount: 1 };
  }),
  down: Effect.fn('addToCartV2.down')(function* ({ payload }) {
    const { amount: _amount, ...rest } = payload;
    return rest;
  }),
  program: () => Effect.succeed({}),
  version: '2.0.0',
});

declare const AddToCartV1PayloadSchema: unknown;
declare const integerDescriptor: unknown;
