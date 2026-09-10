import { primitives } from '@zerospin/schema';
import { Effect } from 'effect';
import { assert, type Equals } from 'tsafe';

import { Async } from '../async/Async.ts';
import { models } from '../models/index.ts';

import type { InferCommand } from './types.ts';

import { contracts, type Command } from './index.ts';

const ItemModel = models.makeModel({ name: 'item', abbreviation: 'itm' });

const Item = models.makeVersion(ItemModel, {
  attributes: { quantity: primitives.integer() },
  indexes: [],
  version: '1.0.0',
});
const V1 = contracts.makeVersion(contracts.makeCommand('setQuantity'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: ItemModel.abbreviation }),
    amount: primitives.integer(),
  },
  version: '1.0.0',
});
const V2 = contracts.upgradeVersion(V1, {
  payload: { amount: null, quantity: primitives.integer() },
  version: '2.0.0',
  up: ({ payload }) =>
    Effect.succeed({ id: payload.id, quantity: payload.amount }),
  down: ({ payload }) =>
    Effect.succeed({ id: payload.id, amount: payload.quantity }),
  models: { item: Item },
  program: ({ payload, models }) => {
    assert<Equals<typeof payload.quantity, number>>();
    // @ts-expect-error Removed fields are absent from the program input.
    void payload.amount;
    return models.item.update({
      resourceId: payload.id,
      attributes: { quantity: payload.quantity },
    });
  },
});
assert<Equals<keyof typeof V2.payload, 'id' | 'quantity'>>();
assert<Equals<InferCommand<typeof V2>['contractVersion'], '2.0.0'>>();
assert<
  Equals<
    InferCommand<typeof V2>['payload'],
    { readonly id: `itm_${string}`; readonly quantity: number }
  >
>();
assert<
  Equals<
    Effect.Success<ReturnType<typeof V2.program>>['operationName'],
    'update'
  >
>();
// @ts-expect-error Canonical fields are readonly.
V2.version = '3.0.0';
// @ts-expect-error Payload descriptors are readonly.
V2.payload.quantity.unique = true;
contracts.upgradeVersion(V2, {
  // @ts-expect-error Removing unknown fields is invalid.
  payload: { missing: null },
  version: '3.0.0',
  up: ({ payload }) => Effect.succeed(payload),
  program: () => Effect.succeed({}),
});
// @ts-expect-error Upgrades require a replacement program.
contracts.upgradeVersion(V2, { payload: {}, version: '3.0.0' });
V2.encodePayload({
  version: '1.0.0',
  // @ts-expect-error V1 payload uses amount, not quantity.
  payload: { id: Item.prefixId('x'), quantity: 1 },
});

assert<
  Equals<
    InferCommand<typeof V2, '1.0.0'>['payload'],
    { readonly id: `itm_${string}`; readonly amount: number }
  >
>();
const downgraded = V2.adaptPayload({
  fromVersion: '2.0.0',
  toVersion: '1.0.0',
  payload: { id: Item.prefixId('x'), quantity: 1 },
});
assert<
  Equals<
    Effect.Success<typeof downgraded>,
    { readonly id: `itm_${string}`; readonly amount: number }
  >
>();

contracts.makeVersion(contracts.makeCommand('probe'), {
  version: '1.0.0',
  payload: { name: primitives.text() },
  guard: ({ payload, db }) => {
    // @ts-expect-error unknown payload field
    void payload.other;
    // @ts-expect-error read only query
    void db.insert;
    return Effect.void;
  },
});

const serviceGuard = contracts.makeVersion(
  contracts.makeCommand('serviceGuard'),
  {
    version: '1.0.0',
    payload: {},
    guard: () => Effect.asVoid(Async),
  },
);
assert<
  Equals<
    Effect.Services<ReturnType<NonNullable<typeof serviceGuard.guard>>>,
    Async
  >
>();

const command = contracts.makeCommand('setQuantity');
assert<Equals<typeof command, Command<'setQuantity'>>>();
const declared = contracts.makeVersion(command, {
  payload: { amount: primitives.integer() },
  version: '1.0.0',
});
assert<Equals<typeof declared.commandName, 'setQuantity'>>();
// @ts-expect-error Contract declarations require a declared command identity.
contracts.makeVersion('setQuantity', { payload: {}, version: '1.0.0' });
// @ts-expect-error Distinct command literals remain distinct after branding.
const otherCommand: Command<'other'> = command;
void otherCommand;

const ModelBound = contracts.makeVersion(contracts.makeCommand('modelBound'), {
  payload: {},
  version: '1.0.0',
  models: { item: Item },
  program: ({ models }) => {
    // @ts-expect-error Only declared bindings are available.
    void models.missing;
    models.item.create({
      // @ts-expect-error Resource IDs retain the declared model abbreviation.
      resourceId: 'wrong_id',
      attributes: { quantity: 1 },
    });
    models.item.create({
      resourceId: Item.prefixId('one'),
      // @ts-expect-error Attributes come from the declared model version.
      attributes: { amount: 1 },
    });
    return models.item.create({
      resourceId: Item.prefixId('one'),
      attributes: { quantity: 1 },
    });
  },
});
assert<
  Equals<
    Effect.Success<ReturnType<typeof ModelBound.program>>['model'],
    typeof Item
  >
>();
const ModelInherited = contracts.upgradeVersion(ModelBound, {
  payload: {},
  version: '2.0.0',
  up: ({ payload }) => Effect.succeed(payload),
  program: ({ models }) =>
    models.item.delete({ resourceId: Item.prefixId('one') }),
});
assert<Equals<typeof ModelInherited.models.item, typeof Item>>();
const ModelRemoved = contracts.upgradeVersion(ModelInherited, {
  payload: {},
  version: '3.0.0',
  up: ({ payload }) => Effect.succeed(payload),
  models: { item: null },
  program: ({ models }) => {
    // @ts-expect-error Removed model bindings are not exposed to the program.
    void models.item;
    return Effect.succeed({});
  },
});
assert<Equals<keyof typeof ModelRemoved.models, never>>();
contracts.makeVersion(contracts.makeCommand('emptyModels'), {
  payload: {},
  version: '1.0.0',
  program: ({ models }) => {
    assert<Equals<keyof typeof models, never>>();
    return Effect.succeed({});
  },
});
