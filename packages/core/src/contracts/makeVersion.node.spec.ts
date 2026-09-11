import type { InferResource } from '@zerospin/core/models/types';
import { ZerospinError } from '@zerospin/error';
import { encodeShape, primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeProvisionedInMemoryWasmSqliteDb } from '../drizzle/makeProvisionedInMemoryWasmSqliteDb.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { runGuard } from '../guards/runGuard.ts';
import { makeModel, makeModelVersion } from '../models/makeModel.ts';
import { prefixId } from '../models/prefixId.ts';

import { adaptPayload } from './adaptPayload.ts';
import { defineCommand } from './Command.ts';
import { decodePayload } from './decodePayload.ts';
import { encodePayload } from './encodePayload.ts';
import { getVersion } from './getVersion.ts';
import {
  Contract,
  makeContractVersion,
  upgradeContractVersion,
} from './makeVersion.ts';
import type { IContract } from './types.ts';
import { validatePayload } from './validatePayload.ts';

const ItemModel = makeModel({ name: 'item', abbreviation: 'itm' });

const Item = makeModelVersion(ItemModel, {
  attributes: { quantity: primitives.integer() },
  indexes: [],
  version: '3.0.0',
});
const V1 = makeContractVersion(defineCommand('setQuantity'), {
  version: '1.0.0',
  payload: {
    id: primitives.foreignKey({ abbreviation: ItemModel.abbreviation }),
  },
});
const V2 = upgradeContractVersion(V1, {
  payload: { amount: primitives.integer() },
  version: '2.0.0',
  up: ({ payload }) => Effect.succeed({ ...payload, amount: 1 }),
  down: ({ payload }) => Effect.succeed({ id: payload.id }),
  models: { item: Item },
  program: ({ payload, models }) =>
    models.item.update({
      resourceId: payload.id,
      attributes: { quantity: payload.amount },
    }),
});
const V3 = upgradeContractVersion(V2, {
  payload: { amount: null, quantity: primitives.integer() },
  version: '3.0.0',
  up: ({ payload }) =>
    Effect.succeed({ id: payload.id, quantity: payload.amount }),
  down: ({ payload }) =>
    Effect.succeed({ id: payload.id, amount: payload.quantity }),
  models: { item: Item },
  program: ({ payload, models }) =>
    models.item.update({
      resourceId: payload.id,
      attributes: { quantity: payload.quantity },
    }),
});

describe('makeContractVersion', () => {
  it('keeps authored adapters on definitions and library operations in utilities', () => {
    const root = makeContractVersion(defineCommand('adapterContent'), {
      version: '1.0.0',
      payload: {},
    });
    const up = () => Effect.succeed({});
    const down = () => Effect.succeed({});
    const child = upgradeContractVersion(root, {
      version: '2.0.0',
      payload: {},
      up,
      down,
      program: () => Effect.succeed({}),
    });
    expect(root.up).toBeUndefined();
    expect(root.down).toBeUndefined();
    expect(child.up).toBe(up);
    expect(child.down).toBe(down);
    expect(child.previous).toBe(root);
    expect(root.next).toBe(child);
    expect(() => Object.assign(child, { up: down })).toThrow();
    for (const definition of [root, child]) {
      for (const name of [
        'getVersion',
        'validatePayload',
        'encodePayload',
        'decodePayload',
        'adaptPayload',
      ]) {
        expect(definition).not.toHaveProperty(name);
      }
    }
    expect(() => Effect.runSync(getVersion(child, '9.0.0'))).toThrow(
      'contract-version-unsupported',
    );
  });

  it('creates independent upgrades with the replacement program', async () => {
    expect(V3).toBeInstanceOf(Contract);
    expect(V3.commandName).toBe(V1.commandName);
    expect(Object.keys(V1.payload)).toEqual(['id']);
    expect(Object.keys(V2.payload)).toEqual(['id', 'amount']);
    expect(Object.keys(V3.payload)).toEqual(['id', 'quantity']);

    expect(V3).not.toHaveProperty('historicalDefinitions');
    expect(V3.spec).not.toHaveProperty('historicalDefinitions');
    const mutation = await Effect.runPromise(
      V3.program({
        authentication: null,
        payload: {
          id: prefixId(Item, 'test'),
          quantity: 4,
        },
      }),
    );
    expect(mutation.operation.attributes).toEqual({ quantity: 4 });
    expect(Effect.runSync(getVersion(V3, '3.0.0'))).toBe(V3);
    expect(Effect.runSync(getVersion(V3, '2.0.0'))).toBe(V2);
    expect(Effect.runSync(getVersion(V3, '1.0.0'))).toBe(V1);
  });

  it('requires caller-supplied IDs without an ID factory', async () => {
    for (const payload of [
      { quantity: 3 },
      { id: undefined, quantity: 3 },
      { id: null, quantity: 3 },
    ]) {
      const result = await Effect.runPromise(
        validatePayload(V3, {
          version: '3.0.0',
          // @ts-expect-error Non-nullable contract IDs must be supplied.
          payload,
        }).pipe(Effect.result),
      );
      expect(result._tag).toBe('Failure');
    }
    expect(
      await Effect.runPromise(
        validatePayload(V3, {
          version: '3.0.0',
          payload: {
            id: prefixId(Item, 'supplied'),
            quantity: 3,
          },
        }),
      ),
    ).toEqual({
      id: prefixId(Item, 'supplied'),
      quantity: 3,
    });
  });

  it('preserves supplied identities and encodes and decodes the exact upgraded payload', async () => {
    const payload = await Effect.runPromise(
      validatePayload(V3, {
        version: '3.0.0',
        payload: {
          id: prefixId(Item, 'upgrade_1'),
          quantity: 3,
        },
      }),
    );
    expect(payload.id).toMatch(/^itm_/);
    const encoded = await Effect.runPromise(
      encodePayload(V3, { version: '3.0.0', payload }),
    );
    expect(
      await Effect.runPromise(
        decodePayload(V3, {
          command: {
            id: 'cmd_test',
            commandName: 'setQuantity',
            contractVersion: '3.0.0',
            payload: encoded,
          },
        }),
      ),
    ).toEqual(payload);
  });

  it('rejects removed fields, malformed retained payloads and mismatched command identities', async () => {
    for (const command of [
      { commandName: 'other', contractVersion: '3.0.0', payload: '{}' },
      { commandName: 'setQuantity', contractVersion: '2.0.0', payload: '{}' },
      {
        commandName: 'setQuantity',
        contractVersion: '3.0.0',
        payload: 'bad json',
      },
      {
        commandName: 'setQuantity',
        contractVersion: '3.0.0',
        payload: '{"id":"itm_test","amount":3}',
      },
      {
        commandName: 'setQuantity',
        contractVersion: '3.0.0',
        payload: '{"id":"itm_test","quantity":3,"amount":3}',
      },
    ]) {
      await expect(
        Effect.runPromise(
          decodePayload(V3, {
            command: { id: 'cmd_test', ...command },
          }),
        ),
      ).rejects.toThrow();
    }
  });

  it('replaces descriptors and validates upgrade inputs', async () => {
    const previous = makeContractVersion(defineCommand('setQuantity'), {
      version: '2.0.0',
      payload: V2.payload,
    });
    const next = upgradeContractVersion(previous, {
      payload: { amount: primitives.text() },
      version: '3.0.0',
      up: ({ payload }) =>
        Effect.succeed({ ...payload, amount: String(payload.amount) }),
      program: () => Effect.succeed({}),
    });
    expect(
      await Effect.runPromise(
        validatePayload(next, {
          version: '3.0.0',
          payload: {
            id: prefixId(Item, 'test'),
            amount: 'three',
          },
        }),
      ),
    ).toMatchObject({ amount: 'three' });
    expect(() =>
      upgradeContractVersion(V2, {
        // @ts-expect-error Cannot remove an unknown field.
        payload: { missing: null },
        version: '3.0.0',
        up: ({ payload }) => Effect.succeed(payload),
        program: () => Effect.succeed({}),
      }),
    ).toThrow('unknown payload field');
    expect(() =>
      upgradeContractVersion(V2, {
        payload: {},
        version: 'invalid',
        up: ({ payload }) => Effect.succeed(payload),
        program: () => Effect.succeed({}),
      }),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      // @ts-expect-error A replacement program is required.
      upgradeContractVersion(V2, { payload: {}, version: '3.0.0' }),
    ).toThrow(Schema.SchemaError);
  });

  it('rejects extra definition properties and owns the serializable spec', () => {
    const props = {
      version: '1.0.0',
      payload: { value: primitives.text() },
      extra: true,
    };
    expect(() => makeContractVersion(defineCommand('test'), props)).toThrow(
      Schema.SchemaError,
    );
    expect(JSON.parse(JSON.stringify(V3.spec))).toMatchObject({
      commandName: 'setQuantity',
      version: '3.0.0',
      payloadShape: encodeShape(V3.payload),
    });
  });
});

describe('contract upgrade edges', () => {
  it('links definitions in both directions and rejects a second child', () => {
    const first = makeContractVersion(defineCommand('linked'), {
      version: '1.0.0',
      payload: {},
    });
    expect(first.previous).toBeUndefined();
    expect(first.next).toBeUndefined();
    expect(() =>
      upgradeContractVersion(first, {
        version: 'invalid',
        payload: {},
        up: ({ payload }) => Effect.succeed(payload),
        program: () => Effect.succeed({}),
      }),
    ).toThrow(Schema.SchemaError);
    expect(first.next).toBeUndefined();
    const second = upgradeContractVersion(first, {
      version: '2.0.0',
      payload: {},
      up: ({ payload }) => Effect.succeed(payload),
      program: () => Effect.succeed({}),
    });
    const third = upgradeContractVersion(second, {
      version: '3.0.0',
      payload: {},
      up: ({ payload }) => Effect.succeed(payload),
      program: () => Effect.succeed({}),
    });
    expect(first.next).toBe(second);
    expect(second.previous).toBe(first);
    expect(second.next).toBe(third);
    expect(third.previous).toBe(second);
    expect(third.next).toBeUndefined();

    expect(Reflect.set(first, 'next', third)).toBe(false);
    expect(Reflect.set(second, 'previous', third)).toBe(false);
    expect(() =>
      upgradeContractVersion(first, {
        version: '4.0.0',
        payload: {},
        up: ({ payload }) => Effect.succeed(payload),
        program: () => Effect.succeed({}),
      }),
    ).toThrow('already has a next version');
    expect(first.next).toBe(second);
    expect(second.previous).toBe(first);
    expect(JSON.stringify(first.spec)).not.toContain('next');
  });

  it('adapts V1 commands upward through both edges without replacing their IDs', async () => {
    const payload = {
      id: prefixId(Item, 'old'),
    };
    const encoded = await Effect.runPromise(
      encodePayload(V3, { version: '1.0.0', payload }),
    );
    const adapted = await Effect.runPromise(
      decodePayload(V3, {
        command: {
          id: 'cmd_old',
          commandName: V1.commandName,
          contractVersion: '1.0.0',
          payload: encoded,
        },
      }),
    );
    expect(adapted).toEqual({ ...payload, quantity: 1 });
    expect(
      (
        await Effect.runPromise(
          V3.program({ authentication: null, payload: adapted }),
        )
      ).operation.attributes,
    ).toEqual({ quantity: 1 });
    expect(
      await Effect.runPromise(
        adaptPayload(V3, {
          fromVersion: '3.0.0',
          toVersion: '1.0.0',
          payload: { ...payload, quantity: 8 },
        }),
      ),
    ).toEqual(payload);
    expect(
      await Effect.runPromise(
        adaptPayload(V3, {
          fromVersion: '2.0.0',
          toVersion: '3.0.0',
          payload: { ...payload, amount: 7 },
        }),
      ),
    ).toEqual({ ...payload, quantity: 7 });
  });

  it('fails when a down edge is absent and rejects duplicate versions', async () => {
    const next = upgradeContractVersion(V3, {
      payload: {},
      version: '4.0.0',
      up: ({ payload }) => Effect.succeed(payload),
      program: V3.program,
    });
    await expect(
      Effect.runPromise(
        adaptPayload(next, {
          fromVersion: '4.0.0',
          toVersion: '1.0.0',
          payload: {
            id: prefixId(Item, 'x'),
            quantity: 1,
          },
        }),
      ),
    ).rejects.toThrow('Missing down adapter');
    expect(() =>
      upgradeContractVersion(V3, {
        payload: {},
        version: '1.0.0',
        up: ({ payload }) => Effect.succeed(payload),
        program: V3.program,
      }),
    ).toThrow('Duplicate contract version');
  });

  it('rejects invalid adapter output and converts adapter defects into failures', async () => {
    const invalidSource = makeContractVersion(defineCommand('setQuantity'), {
      version: '1.0.0',
      payload: V1.payload,
    });
    const invalid = upgradeContractVersion(invalidSource, {
      payload: { amount: primitives.integer() },
      version: '2.0.0',
      // @ts-expect-error Exercise output validation for an untyped adapter.
      up: ({ payload }) => Effect.succeed(payload),
      program: () => Effect.succeed({}),
    });
    await expect(
      Effect.runPromise(
        decodePayload(invalid, {
          command: {
            id: 'cmd_old',
            commandName: V1.commandName,
            contractVersion: '1.0.0',
            payload: '{"id":"itm_old"}',
          },
        }),
      ),
    ).rejects.toThrow('Invalid adapter output');
    const defectiveSource = makeContractVersion(defineCommand('setQuantity'), {
      version: '1.0.0',
      payload: V1.payload,
    });
    const defective = upgradeContractVersion(defectiveSource, {
      payload: {},
      version: '2.0.0',
      up: () => {
        throw new Error('adapter exploded');
      },
      program: () => Effect.succeed({}),
    });
    await expect(
      Effect.runPromise(
        decodePayload(defective, {
          command: {
            id: 'cmd_old',
            commandName: V1.commandName,
            contractVersion: '1.0.0',
            payload: '{"id":"itm_old"}',
          },
        }),
      ),
    ).rejects.toThrow('Payload adapter');
  });
});

it('runs contract guards against current database state and preserves typed rejection', async () => {
  const dbConfig = makeResourceDbConfig({
    models: { item: Item },
    otherTables: {},
  });
  const database = await Effect.runPromise(
    makeProvisionedInMemoryWasmSqliteDb({ dbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
  const guarded = makeContractVersion(defineCommand('checkItem'), {
    version: '1.0.0',
    payload: {
      id: primitives.foreignKey({ abbreviation: ItemModel.abbreviation }),
    },
    guard: ({
      payload,
      db,
    }: {
      payload: { id: InferResource<typeof Item>['id'] };
      db: Readonly<Pick<typeof database, 'query'>>;
    }) =>
      Effect.gen(function* () {
        if (
          db.query.item
            .findFirst({ where: { id: { eq: payload.id } } })
            .sync() === undefined
        ) {
          return yield* new ZerospinError({
            code: 'item-not-found',
            message: 'Item was not found',
          });
        }
      }),
  });
  if (guarded.guard === undefined) throw new Error('Missing guard');
  const props = {
    db: database,
    authentication: { userId: 'user', aggregateId: 'acct_1' },
    payload: {
      id: prefixId(Item, 'guard'),
    },
  };
  const rejected = await Effect.runPromise(
    runGuard({ guard: guarded.guard, props }).pipe(Effect.result),
  );
  expect(rejected).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'item-not-found' },
  });
  database
    .insert(dbConfig.schema.item)
    .values({
      id: props.payload.id,
      modelName: Item.modelName,
      version: Item.version,
      quantity: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  await Effect.runPromise(runGuard({ guard: guarded.guard, props }));
  database.delete(Item.drizzleSchema).run();
  await expect(
    Effect.runPromise(runGuard({ guard: guarded.guard, props })),
  ).rejects.toThrow('Item was not found');
});

it('rejects frontend guard bindings and keeps each contract version guard independent', () => {
  expect(() =>
    Reflect.apply(makeContractVersion, undefined, [
      defineCommand('invalid'),
      { version: '1.0.0', payload: {}, guard: true },
    ]),
  ).toThrow();
  const guarded = makeContractVersion(defineCommand('guarded'), {
    version: '1.0.0',
    payload: {},
    guard: () => Effect.void,
  });
  const next = upgradeContractVersion(guarded, {
    payload: {},
    version: '2.0.0',
    up: ({ payload }) => Effect.succeed(payload),
    program: () => Effect.succeed({}),
    guard: () =>
      Effect.fail(
        new ZerospinError({ code: 'next-rejected', message: 'Next rejected' }),
      ),
  });
  expect(next.guard).not.toBe(guarded.guard);
  expect(Effect.runSync(getVersion(next, '1.0.0')).guard).toBe(guarded.guard);
  expect(() =>
    Reflect.apply(makeFrontendController, undefined, [
      {
        systemName: 'test',
        aggregateName: 'test',
        frontendName: 'web',
        models: {},
        contracts: { guarded: { contract: guarded, guard: () => Effect.void } },
      },
    ]),
  ).toThrow();
});

it('rejects asynchronous contract guards', async () => {
  const guarded = makeContractVersion(defineCommand('asyncGuard'), {
    version: '1.0.0',
    payload: {},
    guard: () => Effect.sleep('1 millis'),
  });
  if (guarded.guard === undefined) throw new Error('Missing guard');
  const result = await Effect.runPromise(
    runGuard({
      guard: guarded.guard,
      props: { payload: {}, db: { query: {} }, authentication: null },
    }).pipe(Effect.result),
  );
  expect(result).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'guard-must-be-synchronous' },
  });
});

it('declares command identities without changing their runtime string', () => {
  const command = defineCommand('setQuantity');
  expect(command).toBe('setQuantity');
  expect(defineCommand('setQuantity')).toBe(command);
  const contract = makeContractVersion(command, {
    payload: {},
    version: '1.0.0',
  });
  expect(contract.commandName).toBe(command);
  expect(JSON.parse(JSON.stringify(contract.spec)).commandName).toBe(command);
});

it('decodes directly to any linked version and traverses each required adapter once', async () => {
  const calls: string[] = [];
  const first = makeContractVersion(defineCommand('linkedPayload'), {
    version: '3.0.0',
    payload: { first: primitives.integer() },
  });
  const second = upgradeContractVersion(first, {
    version: '1.0.0',
    payload: { first: null, second: primitives.integer() },
    up: ({ payload }) => {
      calls.push('first-up');
      return Effect.succeed({ second: payload.first });
    },
    down: ({ payload }) => {
      calls.push('second-down');
      return Effect.succeed({ first: payload.second });
    },
    program: () => Effect.succeed({}),
  });
  const third = upgradeContractVersion(second, {
    version: '2.0.0',
    payload: { second: null, third: primitives.integer() },
    up: ({ payload }) => {
      calls.push('second-up');
      return Effect.succeed({ third: payload.second });
    },
    down: ({ payload }) => {
      calls.push('third-down');
      return Effect.succeed({ second: payload.third });
    },
    program: () => Effect.succeed({}),
  });
  for (const scenario of [
    {
      target: third,
      version: first.version,
      input: { first: 7 },
      output: { third: 7 },
      calls: ['first-up', 'second-up'],
    },
    {
      target: first,
      version: third.version,
      input: { third: 7 },
      output: { first: 7 },
      calls: ['third-down', 'second-down'],
    },
    {
      target: second,
      version: third.version,
      input: { third: 7 },
      output: { second: 7 },
      calls: ['third-down'],
    },
    {
      target: second,
      version: second.version,
      input: { second: 7 },
      output: { second: 7 },
      calls: [],
    },
  ]) {
    calls.length = 0;
    const target: IContract = scenario.target;
    expect(
      await Effect.runPromise(
        decodePayload(target, {
          command: {
            id: 'cmd_linked',
            commandName: first.commandName,
            contractVersion: scenario.version,
            payload: JSON.stringify(scenario.input),
          },
        }),
      ),
    ).toEqual(scenario.output);
    expect(calls).toEqual(scenario.calls);
  }
  const unknown = await Effect.runPromise(
    decodePayload(first, {
      command: {
        id: 'cmd_linked',
        commandName: first.commandName,
        contractVersion: '9.0.0',
        payload: '{}',
      },
    }).pipe(Effect.result),
  );
  expect(unknown).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'contract-payload-version-unsupported' },
  });
});

it('reports missing, invalid and failing down adapters during decoding', async () => {
  for (const mode of ['missing', 'invalid', 'failure']) {
    const first = makeContractVersion(defineCommand('downFailure'), {
      version: '1.0.0',
      payload: { value: primitives.integer() },
    });
    Reflect.apply(upgradeContractVersion, undefined, [
      first,
      {
        version: '2.0.0',
        payload: {},
        up: ({ payload }: { payload: { value: number } }) =>
          Effect.succeed(payload),
        ...(mode === 'missing'
          ? {}
          : {
              down: () =>
                mode === 'failure'
                  ? Effect.fail(
                      new ZerospinError({
                        code: 'test-adapter',
                        message: 'adapter rejected',
                      }),
                    )
                  : Effect.succeed({ value: 'invalid' }),
            }),
        program: () => Effect.succeed({}),
      },
    ]);
    const result = await Effect.runPromise(
      decodePayload(first, {
        command: {
          id: 'cmd_down',
          commandName: first.commandName,
          contractVersion: '2.0.0',
          payload: '{"value":7}',
        },
      }).pipe(Effect.result),
    );
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: {
        code:
          mode === 'missing'
            ? 'contract-payload-adapter-missing'
            : mode === 'invalid'
              ? 'contract-payload-adapter-output-invalid'
              : 'contract-payload-adapter-failed',
      },
    });
  }
});
