import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { Layer, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeMockAggregateSession } from '../makeMockSession/makeMockAggregateSession';
import { makeStandaloneSession } from '../makeStandaloneSession/makeStandaloneSession';

import { makeSession } from './makeSession';

const item = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
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
const definition = {
  kind: 'aggregate' as const,
  aggregateName: 'inventory',
  aggregateVersion: '1.0.0',
  actorName: 'writer',
  actorVersion: '1.0.0',
  sessionName: 'editor',
  models: { item },
  contracts: { observed },
  claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
};

describe('aggregate session constructor declarations', () => {
  for (const constructor of [
    makeSession,
    makeStandaloneSession,
    makeMockAggregateSession,
  ]) {
    it(`${constructor.name} derives model names and preserves canonical contracts`, () => {
      const session = Reflect.apply(constructor, undefined, [
        {
          ...definition,
          definition,
          systemName: 'test',
          layer: Layer.empty,
          key: 'test',
          claims: { aggregateId: 'acct_test' },
        },
      ]);
      expect(session.definition.modelNames).toEqual(['item']);
      expect(session.definition.contracts.observed).toBe(observed);
    });
    it(`${constructor.name} validates plain authored declarations`, () => {
      for (const invalid of [
        { ...definition, contracts: { wrong: observed } },
        { ...definition, models: {} },
        { ...definition, claimsSchema: Schema.Struct({}) },
        {
          ...definition,
          claimsSchema: Schema.Struct({ aggregateId: Schema.Number }),
        },
        {
          ...definition,
          claimsSchema: Schema.Struct({
            aggregateId: Schema.optional(Schema.String),
          }),
        },
        { ...definition, contracts: { observed: { contract: observed } } },
      ]) {
        expect(() =>
          Reflect.apply(constructor, undefined, [
            {
              ...invalid,
              definition: invalid,
              systemName: 'test',
              layer: Layer.empty,
              key: 'test',
              claims: { aggregateId: 'acct_test' },
            },
          ]),
        ).toThrow();
      }
    });
  }
});

describe('standalone session module declarations', () => {
  const { models, contracts, ...identity } = definition;
  const base = {
    ...identity,
    key: 'modules',
    claims: { aggregateId: 'acct_test' },
  };

  it('composes module-only and mixed declarations without changing their identity', () => {
    for (const session of [
      makeStandaloneSession({
        ...base,
        modules: { inventory: { models, contracts } },
      }),
      makeStandaloneSession({
        ...base,
        models,
        modules: { commands: { models: {}, contracts } },
      }),
      makeStandaloneSession({
        ...base,
        contracts,
        modules: { data: { models, contracts: {} } },
      }),
      makeStandaloneSession({
        ...base,
        modules: {
          data: { models, contracts: {} },
          commands: { models: {}, contracts },
        },
      }),
    ]) {
      expect(session.definition.modelNames).toEqual(['item']);
      expect(session.definition.models.item).toBe(item);
      expect(session.definition.contracts.observed).toBe(observed);
      expect(session.definition.models).not.toBe(models);
      expect(session.definition.contracts).not.toBe(contracts);
    }
    expect(models).toEqual({ item });
    expect(contracts).toEqual({ observed });
  });

  it('defaults omitted declarations to empty collections', () => {
    const session = makeStandaloneSession(base);
    expect(session.definition.models).toEqual({});
    expect(session.definition.contracts).toEqual({});
  });

  it('rejects duplicate models and contracts across local declarations and modules', () => {
    for (const declarations of [
      { models, contracts: {} },
      { models: {}, contracts },
    ]) {
      for (const input of [
        { ...declarations, modules: { duplicate: declarations } },
        { modules: { first: declarations, second: declarations } },
      ]) {
        expect(() =>
          Reflect.apply(makeStandaloneSession, undefined, [
            { ...base, ...input },
          ]),
        ).toThrow(/Duplicate (model|contract) declaration/);
      }
    }
  });

  it('validates composed declarations and rejects singular module', () => {
    for (const input of [
      { modules: { invalid: { models, contracts: { wrong: observed } } } },
      { modules: { invalid: { models: {}, contracts } } },
      { modules: { invalid: { models: { wrong: item }, contracts: {} } } },
      {
        modules: {
          invalid: { models, contracts: { observed: { contract: observed } } },
        },
      },
    ]) {
      expect(() =>
        Reflect.apply(makeStandaloneSession, undefined, [
          { ...base, ...input },
        ]),
      ).toThrow();
    }
    expect(() =>
      Reflect.apply(makeStandaloneSession, undefined, [
        { ...base, module: { models, contracts } },
      ]),
    ).toThrow('Unknown session property module');
  });
});
