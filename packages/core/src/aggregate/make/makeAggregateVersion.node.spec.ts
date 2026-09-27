import { RoutePattern } from '@remix-run/route-pattern';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import { describe, expect, it } from 'vitest';

import { makeAggregateActorVersion } from '../../aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion.ts';
import { makeAutomation } from '../../automation/makeAutomation.ts';
import { defineContract } from '../../contracts/defineContract.ts';
import { makeContractVersion } from '../../contracts/make/makeContractVersion.ts';
import { makeActorIdentity } from '../../identity/make/makeActorIdentity/makeActorIdentity.ts';
import { defineModel } from '../../models/defineModel.ts';
import { makeActorDbVersion } from '../../models/make/makeActorDbVersion.ts';
import { makeModelVersion } from '../../models/make/makeModelVersion.ts';
import { makeReplica } from '../../models/make/makeReplica.ts';

import {
  makeAggregateVersion,
  upgradeAggregateVersion,
} from './makeAggregateVersion.ts';

const item = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
  {
    version: '1.0.0',
    attributes: { value: primitives.text() },
    indexes: [],
  },
);
const other = makeModelVersion(
  defineModel({ name: 'other', abbreviation: 'oth' }),
  {
    version: '1.0.0',
    attributes: {},
    indexes: [],
  },
);
const observed = makeContractVersion(defineContract('observed'), {
  version: '1.0.0',
  models: { item },
  payload: {},
});
const notice = makeAutomation({
  name: 'notice',
  on: observed,
  contracts: {},
  program: () => Effect.succeed(null),
});
const declarations = {
  models: { item },
  contracts: { observed },
  automations: { notice },
};
const identity = { name: 'inventory' };
const base = { version: '1.0.0', actors: {} };

describe('aggregate declaration composition', () => {
  it('accepts flat, modules-only, and mixed declarations without copying declaration objects', () => {
    const flat = makeAggregateVersion(identity, { ...base, ...declarations });
    const modular = makeAggregateVersion(identity, {
      ...base,
      modules: { inventory: declarations },
    });
    const mixed = makeAggregateVersion(identity, {
      ...base,
      modules: {
        data: { models: { item }, contracts: {}, automations: {} },
        commands: { models: {}, contracts: { observed }, automations: {} },
      },
      automations: { notice },
    });
    for (const aggregate of [flat, modular, mixed]) {
      expect(aggregate.models.item).toBe(item);
      expect(aggregate.contracts.observed).toBe(observed);
      expect(aggregate.automations.notice).toBe(notice);
      expect(Object.keys(aggregate)).not.toContain('module');
      expect(Object.keys(aggregate)).not.toContain('modules');
    }
    assert<Equals<typeof mixed.models, { readonly item: typeof item }>>();
    assert<
      Equals<typeof modular.contracts, { readonly observed: typeof observed }>
    >();
    assert<
      Equals<typeof mixed.automations, { readonly notice: typeof notice }>
    >();
    const upgraded = upgradeAggregateVersion(mixed, {
      ...base,
      version: '2.0.0',
      modules: { inventory: declarations },
    });
    assert<Equals<typeof upgraded.models, { readonly item: typeof item }>>();
    expect(upgraded.models.item).toBe(item);
    expect(makeAggregateVersion(identity, base).models).toEqual({});
  });

  it('types guards from composed models and validates actor membership', () => {
    const db = makeActorDbVersion({ models: { item } });
    const reader = makeAggregateActorVersion(
      { name: 'reader' },
      {
        authentication: 'none',
        version: '1.0.0',
        db,
        identity: makeActorIdentity({
          schema: Schema.Struct({ aggregateId: Schema.String }),
          actorPath: RoutePattern.parse('/:aggregateId'),
        }),
        queries: {},
        contracts: { observed },
      },
    );
    const aggregate = makeAggregateVersion(identity, {
      ...base,
      modules: { inventory: declarations },
      actors: { reader },
      guards: {
        reader: {
          observed: ({ queryDb, identity }) => {
            const value = queryDb.query.item.findFirst().sync()?.value;
            assert<Equals<typeof value, string | undefined>>();
            assert<Equals<typeof identity.aggregateId, string>>();
            return Effect.void;
          },
        },
      },
    });
    expect(aggregate.actors.reader).toBe(reader);
    expect(() =>
      makeAggregateVersion(identity, { ...base, actors: { reader } }),
    ).toThrow('database model item must be the same object');
  });

  it('validates model references across local and module collections', () => {
    const child = makeModelVersion(
      defineModel({ name: 'child', abbreviation: 'chd' }),
      {
        version: '1.0.0',
        attributes: {
          itemId: primitives.ref({
            table: item.table,
            relation: 'item',
            inverse: 'children',
          }),
        },
        indexes: [],
      },
    );
    const children = { models: { child }, contracts: {}, automations: {} };
    const aggregate = makeAggregateVersion(identity, {
      ...base,
      models: { item },
      modules: { children },
    });
    expect(aggregate.models.child).toBe(child);
    const reversed = makeAggregateVersion(identity, {
      ...base,
      models: { child },
      modules: { items: { models: { item }, contracts: {}, automations: {} } },
    });
    expect(reversed.models.item).toBe(item);
  });

  it.each([
    ['model', { models: { item }, contracts: {}, automations: {} }],
    ['contract', { models: {}, contracts: { observed }, automations: {} }],
    ['automation', { models: {}, contracts: {}, automations: { notice } }],
  ] as const)(
    'rejects duplicate %s declarations regardless of attachment order',
    (kind, module) => {
      for (const modules of [
        { first: module, second: module },
        { second: module, first: module },
      ]) {
        expect(() =>
          Reflect.apply(makeAggregateVersion, undefined, [
            identity,
            { ...base, modules },
          ]),
        ).toThrow(`Duplicate ${kind} declaration`);
      }
      expect(() =>
        Reflect.apply(makeAggregateVersion, undefined, [
          identity,
          {
            ...base,
            ...module,
            modules: { duplicate: module },
          },
        ]),
      ).toThrow(`Duplicate ${kind} declaration`);
    },
  );

  it('validates cross-module references against the final inventory', () => {
    expect(() =>
      makeAggregateVersion(identity, {
        ...base,
        modules: {
          commands: { models: {}, contracts: { observed }, automations: {} },
        },
      }),
    ).toThrow('must belong to aggregate');
    expect(() =>
      makeAggregateVersion(identity, { ...base, automations: { notice } }),
    ).toThrow('trigger must reference its final contract');
  });

  it('derives service pins from all modules and rejects conflicting versions', () => {
    const replica = makeReplica({
      sourceModel: item,
      serviceName: 'stock',
      serviceVersion: '1.0.0',
    });
    const second = makeReplica({
      sourceModel: other,
      serviceName: 'stock',
      serviceVersion: '2.0.0',
    });
    const modules = {
      stock: { models: { item: replica }, contracts: {}, automations: {} },
    };
    expect(
      makeAggregateVersion(identity, { ...base, modules }).services,
    ).toEqual({ stock: '1.0.0' });
    expect(() =>
      makeAggregateVersion(identity, {
        ...base,
        modules,
        models: { other: second },
      }),
    ).toThrow('Conflicting service versions');
  });
});

// Compile-only assertions keep inference from widening away known collisions.
function checkDuplicateDeclarations() {
  makeAggregateVersion(identity, {
    ...base,
    models: { item },
    // @ts-expect-error A local model and module model cannot share a key.
    modules: { data: { models: { item }, contracts: {}, automations: {} } },
  });
  makeAggregateVersion(identity, {
    ...base,
    contracts: { observed },
    modules: {
      // @ts-expect-error A local contract and module contract cannot share a key.
      commands: { models: {}, contracts: { observed }, automations: {} },
    },
  });
  upgradeAggregateVersion(identity, {
    ...base,
    automations: { notice },
    modules: {
      // @ts-expect-error An upgrade also rejects a local/module automation collision.
      reactions: { models: {}, contracts: {}, automations: { notice } },
    },
  });
  makeAggregateVersion(identity, {
    ...base,
    // @ts-expect-error Independent modules cannot repeat declarations, even identical objects.
    modules: { first: declarations, second: declarations },
  });
  makeAggregateVersion(identity, {
    ...base,
    // @ts-expect-error Reversing module order does not permit overriding a declaration.
    modules: { second: declarations, first: declarations },
  });
}
void checkDuplicateDeclarations;

it('checks dynamically keyed modules and leaves caller collections unchanged', () => {
  const modules: Record<
    string,
    import('../../module/types.ts').IAnyDeclarationModule
  > = { first: declarations, second: declarations };
  expect(() => makeAggregateVersion(identity, { ...base, modules })).toThrow(
    'Duplicate model declaration item',
  );
  const aggregate = makeAggregateVersion(identity, {
    ...base,
    ...declarations,
  });
  expect(aggregate.models).not.toBe(declarations.models);
  expect(declarations.models).toEqual({ item });
});
