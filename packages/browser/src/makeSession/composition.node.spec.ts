import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { makeReplica } from '@zerospin/core/models/make/makeReplica';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { Layer, Redacted, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import { describe, expect, it } from 'vitest';

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
const data = { models: { item }, contracts: {}, automations: {} };
const commands = { models: {}, contracts: { observed }, automations: {} };
const common = {
  systemName: 'test',
  sessionName: 'test',
  actorName: 'reader',
  actorVersion: '1.0.0',
  identitySchema: Schema.Struct({ aggregateId: Schema.String }),
  layer: Layer.mergeAll(
    Layer.succeed(ZerospinApiUrl, 'http://test'),
    Layer.succeed(PublishableKey, Redacted.make('pk_test')),
  ),
};
const aggregate = {
  ...common,
  kind: 'aggregate' as const,
  aggregateName: 'test',
  aggregateVersion: '1.0.0',
};
const service = {
  ...common,
  kind: 'service' as const,
  serviceName: 'test',
  serviceVersion: '1.0.0',
};

describe('browser session declaration composition', () => {
  it('constructs flat, modular, and mixed aggregate definitions', () => {
    const flat = makeSession({
      ...aggregate,
      models: { item },
      contracts: { observed },
    });
    const modular = makeSession({ ...aggregate, modules: { data, commands } });
    const mixed = makeSession({
      ...aggregate,
      modules: { commands },
      models: { item },
    });
    for (const session of [flat, modular, mixed]) {
      expect(session.definition.models.item).toBe(item);
      expect(session.definition.contracts.observed.contract).toBe(observed);
      expect(session.store.getState().isInitialized).toBe(false);
    }
    assert<Equals<typeof modular.definition.models.item, typeof item>>();
    assert<
      Equals<
        typeof mixed.definition.contracts.observed.contract,
        typeof observed
      >
    >();
  });

  it('constructs flat, modular, and mixed service definitions', () => {
    const flat = makeSession({ ...service, models: { item } });
    const modular = makeSession({ ...service, modules: { data } });
    const mixed = makeSession({
      ...service,
      modules: { empty: { models: {}, contracts: {}, automations: {} } },
      models: { item },
    });
    for (const session of [flat, modular, mixed]) {
      expect(session.definition.models.item).toBe(item);
      expect(session.definition.contracts).toEqual({});
    }
    assert<Equals<typeof modular.definition.models.item, typeof item>>();
  });

  it('rejects duplicates in either session kind, including identical objects', () => {
    for (const base of [aggregate, service]) {
      expect(() =>
        Reflect.apply(makeSession, undefined, [
          { ...base, modules: { first: data, second: data } },
        ]),
      ).toThrow('Duplicate model declaration item');
      expect(() =>
        Reflect.apply(makeSession, undefined, [
          { ...base, models: { item }, modules: { data } },
        ]),
      ).toThrow('Duplicate model declaration item');
    }
    expect(() =>
      Reflect.apply(makeSession, undefined, [
        {
          ...aggregate,
          modules: { data, commands },
          contracts: { observed },
        },
      ]),
    ).toThrow('Duplicate contract declaration observed');
  });

  it('rejects forbidden local and modular declarations instead of dropping them', () => {
    const replica = makeReplica({
      sourceModel: item,
      serviceName: 'stock',
      serviceVersion: '1.0.0',
    });
    for (const modular of [false, true]) {
      const automated = {
        models: {},
        contracts: {},
        automations: { forbidden: {} },
      };
      const withReplica = { ...data, models: { item: replica } };
      for (const base of [aggregate, service]) {
        expect(() =>
          Reflect.apply(makeSession, undefined, [
            { ...base, ...(modular ? { modules: { automated } } : automated) },
          ]),
        ).toThrow('cannot contain automations');
      }
      expect(() =>
        Reflect.apply(makeSession, undefined, [
          { ...service, ...(modular ? { modules: { commands } } : commands) },
        ]),
      ).toThrow('cannot contain contracts');
      expect(() =>
        Reflect.apply(makeSession, undefined, [
          {
            ...service,
            ...(modular ? { modules: { withReplica } } : withReplica),
          },
        ]),
      ).toThrow('must be authoritative');
    }
  });

  it('validates aggregate contracts against the complete model inventory', () => {
    expect(() =>
      Reflect.apply(makeSession, undefined, [
        { ...aggregate, modules: { commands } },
      ]),
    ).toThrow('must belong to session');
  });
});

function checkDuplicateSessionDeclarations() {
  // @ts-expect-error Identical modules still contribute duplicate model keys.
  makeSession({ ...aggregate, modules: { first: data, second: data } });
  // @ts-expect-error A local model cannot override a module model.
  makeSession({ ...service, models: { item }, modules: { data } });
  // @ts-expect-error Module contract collisions cannot be hidden by inference.
  makeSession({ ...aggregate, modules: { first: commands, second: commands } });
}
void checkDuplicateSessionDeclarations;
