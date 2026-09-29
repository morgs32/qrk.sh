import { RoutePattern } from '@remix-run/route-pattern';
import { AggregateError } from '@zerospin/error';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import { describe, expect, it } from 'vitest';

import { makeAggregateActorVersion } from '../../aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion.ts';
import { defineContract } from '../../contracts/defineContract.ts';
import { makeContractVersion } from '../../contracts/make/makeContractVersion.ts';
import type { IModelMutations } from '../../contracts/types.ts';
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
const declarations = {
  models: { item },
  contracts: { observed },
};
const identity = { name: 'inventory' };
const base = { version: '1.0.0', actors: {} };

describe('aggregate declaration composition', () => {
  it('types extensions from effective contracts and full aggregate models', () => {
    const submit = makeContractVersion(defineContract('submit'), {
      version: '1.0.0',
      models: { item },
      payload: { amount: primitives.integer() },
      failures: { unavailable: AggregateError.schema({ code: 'unavailable' }) },
      program: () => Effect.succeed([]),
    });
    const aggregate = makeAggregateVersion(identity, {
      ...base,
      models: { other },
      modules: {
        inventory: { models: { item }, contracts: { submit } },
      },
      extensions: {
        submit: ({ db, models, payload, failures }) => {
          assert<Equals<typeof payload.amount, number>>();
          assert<Equals<typeof models.other, IModelMutations<typeof other>>>();
          db.query.other.findFirst().sync();
          db.query.item.findFirst().sync();
          // @ts-expect-error Extensions only receive the query interface.
          const write = db.insert;
          expect(write).toBeUndefined();
          return payload.amount > 0
            ? Effect.succeed([])
            : failures.unavailable.make();
        },
      },
    });
    expect(aggregate.extensions.submit).toBeDefined();
    expect(() =>
      makeAggregateVersion(identity, {
        ...base,
        modules: {
          inventory: {
            models: { item },
            contracts: { submit },
          },
        },
        extensions: {
          // @ts-expect-error Unknown command keys are not part of the effective contracts.
          unknown: () => Effect.succeed([]),
        },
      }),
    ).toThrow('Unknown aggregate extension command unknown');
  });

  it('accepts flat, modules-only, and mixed declarations without copying declaration objects', () => {
    const flat = makeAggregateVersion(identity, { ...base, ...declarations });
    const modular = makeAggregateVersion(identity, {
      ...base,
      modules: { inventory: declarations },
    });
    const mixed = makeAggregateVersion(identity, {
      ...base,
      modules: {
        data: { models: { item }, contracts: {} },
        commands: { models: {}, contracts: { observed } },
      },
    });
    for (const aggregate of [flat, modular, mixed]) {
      expect(aggregate.models.item).toBe(item);
      expect(aggregate.contracts.observed).toBe(observed);
      expect(Object.keys(aggregate)).not.toContain('module');
      expect(Object.keys(aggregate)).not.toContain('modules');
    }
    assert<Equals<typeof mixed.models, { readonly item: typeof item }>>();
    assert<
      Equals<typeof modular.contracts, { readonly observed: typeof observed }>
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
          claims: Schema.Struct({ aggregateId: Schema.String }),
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
          observed: ({ db, claims }) => {
            const value = db.query.item.findFirst().sync()?.value;
            assert<Equals<typeof value, string | undefined>>();
            assert<Equals<typeof claims.aggregateId, string>>();
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
    const children = { models: { child }, contracts: {} };
    const aggregate = makeAggregateVersion(identity, {
      ...base,
      models: { item },
      modules: { children },
    });
    expect(aggregate.models.child).toBe(child);
    const reversed = makeAggregateVersion(identity, {
      ...base,
      models: { child },
      modules: { items: { models: { item }, contracts: {} } },
    });
    expect(reversed.models.item).toBe(item);
  });

  it.each([
    ['model', { models: { item }, contracts: {} }],
    ['contract', { models: {}, contracts: { observed } }],
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
          commands: { models: {}, contracts: { observed } },
        },
      }),
    ).toThrow('must belong to aggregate');
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
      stock: { models: { item: replica }, contracts: {} },
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
    modules: { data: { models: { item }, contracts: {} } },
  });
  makeAggregateVersion(identity, {
    ...base,
    contracts: { observed },
    modules: {
      // @ts-expect-error A local contract and module contract cannot share a key.
      commands: { models: {}, contracts: { observed } },
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
