import { CuidFactory, primitives } from '@zerospin/schema';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { models } from '../models/index.ts';
import { makeReplica } from '../models/makeReplica.ts';

import { makeModelMutations } from './makeModelMutations.ts';
import { makeMutations } from './makeMutations.ts';

import { contracts } from './index.ts';

const CartV1 = models.makeVersion(
  models.makeModel({ name: 'cart', abbreviation: 'crt' }),
  {
    attributes: { quantity: primitives.integer() },
    indexes: [],
    version: '1.0.0',
  },
);
const CartV2 = models.upgradeVersion(CartV1, {
  attributes: { quantity: null, amount: primitives.integer() },
  version: '2.0.0',
});

describe('contract model bindings', () => {
  it('binds the declared version and snapshots the map and serializable specs', async () => {
    const declarations = { cart: CartV1 };
    const contract = contracts.makeVersion(
      contracts.makeCommand('createCart'),
      {
        payload: {},
        version: '1.0.0',
        models: declarations,
        program: ({ models }) =>
          models.cart.create({
            resourceId: CartV1.prefixId('one'),
            attributes: { quantity: 2 },
          }),
      },
    );
    Reflect.deleteProperty(declarations, 'cart');
    const mutation = await Effect.runPromise(contract.program({ payload: {} }));
    expect(mutation.model).toBe(CartV1);
    expect(mutation.modelVersion).toBe('1.0.0');
    expect(contract.models.cart).toBe(CartV1);
    expect(contract.spec.models).toEqual({ cart: CartV1.spec });
    expect(contract.spec.models.cart).not.toBe(CartV1.spec);
    expect(JSON.parse(JSON.stringify(contract.spec)).models).toEqual({
      cart: CartV1.spec,
    });
    expect(CartV1).not.toHaveProperty('create');
  });

  it('inherits, replaces, adds and removes bindings without changing earlier versions', async () => {
    const v1 = contracts.makeVersion(contracts.makeCommand('changeCart'), {
      payload: {},
      version: '1.0.0',
      models: { cart: CartV1, removed: CartV1 },
      program: ({ models }) =>
        models.cart.create({
          resourceId: CartV1.prefixId('one'),
          attributes: { quantity: 1 },
        }),
    });
    const v2 = contracts.upgradeVersion(v1, {
      payload: {},
      version: '2.0.0',
      up: ({ payload }) => Effect.succeed(payload),
      program: ({ models }) =>
        models.cart.create({
          resourceId: CartV1.prefixId('two'),
          attributes: { quantity: 2 },
        }),
    });
    const v3 = contracts.upgradeVersion(v2, {
      payload: {},
      version: '3.0.0',
      up: ({ payload }) => Effect.succeed(payload),
      models: { cart: CartV2, removed: null, added: CartV1 },
      program: ({ models }) =>
        Effect.all({
          current: models.cart.create({
            resourceId: CartV2.prefixId('three'),
            attributes: { amount: 3 },
          }),
          added: models.added.delete({ resourceId: CartV1.prefixId('four') }),
        }),
    });
    expect((await Effect.runPromise(v1.program({ payload: {} }))).model).toBe(
      CartV1,
    );
    expect((await Effect.runPromise(v2.program({ payload: {} }))).model).toBe(
      CartV1,
    );
    expect(
      (await Effect.runPromise(v3.program({ payload: {} }))).current.model,
    ).toBe(CartV2);
    expect(v1.spec.models).toEqual({ cart: CartV1.spec, removed: CartV1.spec });
    expect(v2.spec.models).toEqual(v1.spec.models);
    expect(v3.spec.models).toEqual({ cart: CartV2.spec, added: CartV1.spec });
    expect(v3.models).not.toHaveProperty('removed');
    expect(() =>
      contracts.upgradeVersion(v3, {
        payload: {},
        version: '4.0.0',
        up: ({ payload }) => Effect.succeed(payload),
        // @ts-expect-error Cannot remove an undeclared model.
        models: { missing: null },
        program: () => Effect.succeed({}),
      }),
    ).toThrow('Cannot remove unknown model "missing"');
  });

  it('supplies an empty map and rejects non-model declarations', async () => {
    const empty = contracts.makeVersion(contracts.makeCommand('empty'), {
      payload: {},
      version: '1.0.0',
      program: ({ models }) => {
        expect(models).toEqual({});
        return Effect.succeed({});
      },
    });
    await Effect.runPromise(empty.program({ payload: {} }));
    expect(empty.spec.models).toEqual({});
    expect(() =>
      contracts.makeVersion(contracts.makeCommand('invalid'), {
        payload: {},
        version: '1.0.0',
        // @ts-expect-error Runtime rejects structural copies too.
        models: { cart: {} },
      }),
    ).toThrow();
  });

  it('preserves mutation validation and model scope validation during execution', async () => {
    const contract = contracts.makeVersion(
      contracts.makeCommand('createCart'),
      {
        payload: {},
        version: '1.0.0',
        models: { cart: CartV1 },
        program: ({ models }) =>
          models.cart.create({
            resourceId: CartV1.prefixId('one'),
            attributes: { quantity: 2 },
          }),
      },
    );
    const command = {
      id: 'cmd_one',
      commandName: 'createCart',
      contractVersion: '1.0.0',
      payload: {},
    } satisfies Parameters<typeof makeMutations>[0]['command'];
    const result = await Effect.runPromise(
      makeMutations({
        contract,
        command,
        models: { cart: CartV1 },
      }).pipe(
        Effect.provideService(CuidFactory, () => Effect.succeed('unused')),
      ),
    );
    expect(result.mutations[0]?.model).toBe(CartV1);
    await expect(
      Effect.runPromise(
        makeMutations({
          contract,
          command,
          models: {},
        }).pipe(
          Effect.provideService(CuidFactory, () => Effect.succeed('unused')),
        ),
      ),
    ).rejects.toThrow();
    await expect(
      Effect.runPromise(
        makeModelMutations(CartV1).create({
          resourceId: CartV1.prefixId('bad'),
          // @ts-expect-error Missing required attribute is rejected at runtime too.
          attributes: {},
        }),
      ),
    ).rejects.toThrow('create-resource-missing-attributes');
    const mutation = await Effect.runPromise(
      makeModelMutations(CartV1).update({
        resourceId: CartV1.prefixId('one'),
        attributes: { quantity: 4 },
        mask: [],
      }),
    );
    expect(mutation.operation).toEqual({ attributes: {}, mask: [] });
  });

  it('binds replica provenance and validates complete source resources', async () => {
    const replica = makeReplica({
      sourceModel: CartV1,
      modelVersion: CartV1.version,
      serviceName: 'catalog',
    });
    const resource = {
      id: CartV1.prefixId('one'),
      modelName: CartV1.modelName,
      version: CartV1.version,
      quantity: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const contract = contracts.makeVersion(
      contracts.makeCommand('replicateCart'),
      {
        payload: {},
        version: '1.0.0',
        models: { cart: replica },
        program: ({ models }) => models.cart.replicate(resource),
      },
    );
    const mutation = await Effect.runPromise(contract.program({ payload: {} }));
    expect(mutation.model).toBe(replica);
    expect(mutation.operation.serviceName).toBe('catalog');
    expect(mutation.operation.resource).toEqual({
      ...resource,
      deletedAt: null,
      serviceIndex: null,
    });
    await expect(
      Effect.runPromise(
        makeModelMutations(replica).replicate({
          ...resource,
          version: '9.0.0',
        }),
      ),
    ).rejects.toThrow('replicate-resource-model-version-mismatch');
    await expect(
      Effect.runPromise(
        makeModelMutations(CartV1).replicate(
          // @ts-expect-error Authoritative models cannot replicate.
          resource,
        ),
      ),
    ).rejects.toThrow('replicate-resource-not-replica');
  });
});
