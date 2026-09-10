import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeService } from '../service/makeService.ts';

import { aggregates } from './index.ts';

const AppV1 = makeService({
  name: 'app',
  version: '1.0.0',
  models: {},
  contracts: {},
});
const V1 = aggregates.makeVersion(
  aggregates.makeAggregate({ name: 'shopper' }),
  {
    version: '1.0.0',
    models: {},
    contracts: {},
    selections: {},
    services: { app: AppV1 },
  },
);
const V2 = aggregates.upgradeVersion(V1, { version: '2.0.0' });

describe('aggregate service definitions', () => {
  it('derives pins from service definitions and replaces them through upgrades', () => {
    expect(V1.services).toEqual({ app: AppV1.version });
    const AppV2 = makeService({
      name: 'app',
      version: '2.0.0',
      models: {},
      contracts: {},
      frontends: {},
    });
    const upgraded = aggregates.upgradeVersion(V2, {
      version: '3.0.0',
      services: { app: AppV2 },
    });
    expect(upgraded.services).toEqual({ app: '2.0.0' });
    expect(
      aggregates.upgradeVersion(upgraded, { version: '4.0.0' }).services,
    ).toEqual({
      app: '2.0.0',
    });
    expect(V1.services).toEqual({ app: '1.0.0' });
  });

  it('rejects service strings, structural copies, and mismatched names', () => {
    expect(() =>
      aggregates.upgradeVersion(V1, {
        version: '2.0.0',
        services: { wrong: AppV1 },
      }),
    ).toThrow('must match service name');
    expect(() =>
      aggregates.upgradeVersion(V1, {
        version: '2.0.0',
        services: { app: { ...AppV1 } },
      }),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      aggregates.upgradeVersion(V1, {
        version: '2.0.0',
        services: {
          // @ts-expect-error Service definitions replace version-string inputs.
          app: '1.0.0',
        },
      }),
    ).toThrow(Schema.SchemaError);
  });

  it('removes inherited dependencies and rejects unknown removals', () => {
    const removed = aggregates.upgradeVersion(V2, {
      version: '3.0.0',
      services: { app: null },
    });
    expect(removed.services).toEqual({});
    expect(
      aggregates.upgradeVersion(removed, { version: '4.0.0' }).services,
    ).toEqual({});
    expect(V2.services).toEqual({ app: '1.0.0' });
    expect(() =>
      aggregates.upgradeVersion(removed, {
        version: '4.0.0',
        services: { app: null },
      }),
    ).toThrow('unknown services entry');
  });

  it('rejects version strings when first authoring an aggregate', () => {
    expect(() =>
      aggregates.makeVersion(aggregates.makeAggregate({ name: 'invalid' }), {
        version: '1.0.0',
        models: {},
        contracts: {},
        selections: {},
        services: {
          // @ts-expect-error Service definitions replace version-string inputs.
          app: '1.0.0',
        },
      }),
    ).toThrow(Schema.SchemaError);
  });
});
