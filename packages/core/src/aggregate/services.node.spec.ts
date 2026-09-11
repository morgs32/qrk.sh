import { userAggregate as authenticationFixtureOwner } from '@zerospin/core/fixtures/system';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeService } from '../service/makeService.ts';

import { makeAggregate } from './makeAggregate.ts';
import {
  makeAggregateVersion,
  upgradeAggregateVersion,
} from './makeVersion.ts';

const AppV1 = makeService({
  authentication: authenticationFixtureOwner.authentication,
  name: 'app',
  version: '1.0.0',
  models: {},
  contracts: {},
});
const V1 = makeAggregateVersion(makeAggregate({ name: 'shopper' }), {
  authentication: authenticationFixtureOwner.authentication,
  version: '1.0.0',
  models: {},
  contracts: {},
  selections: {},
  services: { app: AppV1 },
});
const V2 = upgradeAggregateVersion(V1, { version: '2.0.0' });

describe('aggregate service definitions', () => {
  it('derives pins from service definitions and replaces them through upgrades', () => {
    expect(V1.services).toEqual({ app: AppV1.version });
    const AppV2 = makeService({
      authentication: authenticationFixtureOwner.authentication,
      name: 'app',
      version: '2.0.0',
      models: {},
      contracts: {},
      frontends: {},
    });
    const upgraded = upgradeAggregateVersion(V2, {
      version: '3.0.0',
      services: { app: AppV2 },
    });
    expect(upgraded.services).toEqual({ app: '2.0.0' });
    expect(
      upgradeAggregateVersion(upgraded, { version: '4.0.0' }).services,
    ).toEqual({
      app: '2.0.0',
    });
    expect(V1.services).toEqual({ app: '1.0.0' });
  });

  it('rejects service strings, structural copies, and mismatched names', () => {
    expect(() =>
      upgradeAggregateVersion(V1, {
        version: '2.0.0',
        services: { wrong: AppV1 },
      }),
    ).toThrow('must match service name');
    expect(() =>
      upgradeAggregateVersion(V1, {
        version: '2.0.0',
        services: { app: { ...AppV1 } },
      }),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      upgradeAggregateVersion(V1, {
        version: '2.0.0',
        services: {
          // @ts-expect-error Service definitions replace version-string inputs.
          app: '1.0.0',
        },
      }),
    ).toThrow(Schema.SchemaError);
  });

  it('removes inherited dependencies and rejects unknown removals', () => {
    const removed = upgradeAggregateVersion(V2, {
      version: '3.0.0',
      services: { app: null },
    });
    expect(removed.services).toEqual({});
    expect(
      upgradeAggregateVersion(removed, { version: '4.0.0' }).services,
    ).toEqual({});
    expect(V2.services).toEqual({ app: '1.0.0' });
    expect(() =>
      upgradeAggregateVersion(removed, {
        version: '4.0.0',
        services: { app: null },
      }),
    ).toThrow('unknown services entry');
  });

  it('rejects version strings when first authoring an aggregate', () => {
    expect(() =>
      makeAggregateVersion(makeAggregate({ name: 'invalid' }), {
        authentication: authenticationFixtureOwner.authentication,
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
