import { RoutePattern } from '@remix-run/route-pattern';
import { Effect, Schema } from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import * as browser from './browser/index.js';

import * as sdk from './index.js';

const sharedExports = [
  'defineCommand',
  'makeModel',
  'makeModelVersion',
  'upgradeModelVersion',
  'makeContractVersion',
  'upgradeContractVersion',
  'makeReplica',
  'makeSelection',
  'makeFrontendController',
  'makeId',
  'prefixId',
  'makeAggregateId',
  'primitives',
  'ZerospinError',
  'CuidFactory',
  'NanoIdFactory',
  'PublishableKey',
  'ZerospinApiUrl',
  'ZEROSPIN_SDK_VERSION',
];
const serverExports = [
  'makeAggregate',
  'makeAggregateVersion',
  'upgradeAggregateVersion',
  'makeService',
  'makeSystem',
  'makeSystemConfig',
  'makeCommand',
];

const change = sdk.makeContractVersion(sdk.defineCommand('change'), {
  version: '1.0.0',
  payload: { name: sdk.primitives.text() },
});
const service = sdk.makeService({
  authentication: {
    signatureSchema: Schema.Struct({ userId: Schema.String }),
    authenticationSchema: Schema.Struct({
      aggregateId: Schema.Literal('acct_test'),
      userId: Schema.String,
    }),
    selectionSchema: Schema.Struct({ userId: Schema.String }),
    pattern: RoutePattern.parse('/:userId'),
    authenticate: ({ signature }) =>
      Effect.succeed({
        aggregateId: 'acct_test',
        userId: signature.userId,
      } satisfies { aggregateId: 'acct_test'; userId: string }),
  },
  name: 'catalog',
  version: '2.0.0',
  models: {},
  contracts: { change },
});
const aggregate = sdk.makeAggregateVersion(
  sdk.makeAggregate({ name: 'shopper' }),
  {
    version: '3.0.0',
    authentication: {
      signatureSchema: Schema.Struct({ userId: Schema.String }),
      authenticationSchema: Schema.Struct({
        aggregateId: Schema.Literal('acct_test'),
        userId: Schema.String,
      }),
      selectionSchema: Schema.Struct({ userId: Schema.String }),
      pattern: RoutePattern.parse('/:userId'),
      authenticate: ({ signature }) =>
        Effect.succeed({
          aggregateId: 'acct_test',
          userId: signature.userId,
        } satisfies { aggregateId: 'acct_test'; userId: string }),
    },
    models: {},
    contracts: { change: { contract: change } },
    selections: {},
  },
);

describe('flat SDK authoring', () => {
  it('exports only the deliberate public runtime API', () => {
    expect(Object.keys(browser).sort()).toEqual([...sharedExports].sort());
    expect(Object.keys(sdk).sort()).toEqual(
      [...sharedExports, ...serverExports].sort(),
    );
  });

  it('loads the browser entrypoint without evaluating server-only factories', async () => {
    vi.resetModules();
    vi.doMock('@zerospin/server-only', () => {
      throw new Error('server-only evaluated');
    });
    try {
      const loaded = await import('./browser/index.js');
      expect(loaded.defineCommand('browser')).toBe('browser');
    } finally {
      vi.doUnmock('@zerospin/server-only');
      vi.resetModules();
    }
  });

  it('preserves branding, inferred owner metadata, full command shapes and ID generation', () => {
    const declared = sdk.defineCommand('change');
    expectTypeOf(declared).toEqualTypeOf<sdk.Command<'change'>>();
    const commands = Effect.runSync(
      Effect.all([
        sdk.makeCommand(service, {
          contractName: 'change',
          payload: { name: 'service' },
        }),
        sdk.makeCommand(aggregate, {
          contractName: 'change',
          aggregateId: 'acct_shopper',
          systemName: 'shopping',
          payload: { name: 'aggregate' },
        }),
      ]).pipe(
        Effect.provideService(sdk.CuidFactory, () => Effect.succeed('fixed')),
      ),
    );
    expectTypeOf(commands[0].serviceName).toEqualTypeOf<'catalog'>();
    expectTypeOf(commands[0].contractVersion).toEqualTypeOf<'1.0.0'>();
    expectTypeOf(commands[1].aggregateName).toEqualTypeOf<'shopper'>();
    expectTypeOf(commands[1].systemName).toEqualTypeOf<'shopping'>();
    expectTypeOf(commands[1].payload).toEqualTypeOf<{
      readonly name: string;
    }>();
    expect(commands).toEqual([
      {
        id: 'cmd_fixed',
        commandName: 'change',
        contractVersion: '1.0.0',
        payload: { name: 'service' },
        serviceName: 'catalog',
        serviceVersion: '2.0.0',
      },
      {
        id: 'cmd_fixed',
        commandName: 'change',
        contractVersion: '1.0.0',
        payload: { name: 'aggregate' },
        aggregateName: 'shopper',
        aggregateVersion: '3.0.0',
        aggregateId: 'acct_shopper',
        systemName: 'shopping',
        authentication: null,
        pushIndex: null,
        sessionId: null,
        frontendName: null,
      },
    ]);
  });

  it('retains typed failure behavior for absent contracts and invalid payloads', () => {
    const invalid = [
      // @ts-expect-error Contract names come from the supplied owner.
      sdk.makeCommand(service, { contractName: 'missing', payload: {} }),
      // @ts-expect-error Payloads retain the selected contract input type.
      sdk.makeCommand(service, {
        contractName: 'change',
        payload: { name: 1 },
      }),
      // prettier-ignore
      // @ts-expect-error Aggregate contract names come from the supplied owner.
      sdk.makeCommand(aggregate, { contractName: 'missing', aggregateId: 'acct_a', systemName: 'shopping', payload: { name: 'valid' }, }),
      // prettier-ignore
      // @ts-expect-error Aggregate payloads retain the selected contract input type.
      sdk.makeCommand(aggregate, { contractName: 'change', aggregateId: 'acct_a', systemName: 'shopping', payload: { name: 1 }, }),
    ];
    for (const command of invalid) {
      expect(
        Effect.runSync(
          command.pipe(
            Effect.provideService(sdk.CuidFactory, () =>
              Effect.succeed('fixed'),
            ),
            Effect.result,
          ),
        ),
      ).toMatchObject({ _tag: 'Failure' });
    }
  });

  it('preserves configuration identity, concrete types and synchronous validation', () => {
    const system = sdk.makeSystem({
      name: 'shopping',
      aggregates: {},
    });
    const config = sdk.makeSystemConfig(system, { systemId: 'sys_test' });
    expectTypeOf(config.system).toEqualTypeOf<typeof system>();
    expect(config.system).toBe(system);
    expect(config).toEqual({ system, systemId: 'sys_test' });
    expect(system).not.toHaveProperty('config');
    // @ts-expect-error System IDs retain their prefix.
    expect(() => sdk.makeSystemConfig(system, { systemId: 'invalid' })).toThrow(
      Schema.SchemaError,
    );
    expect(() => sdk.makeSystemConfig({}, { systemId: 'sys_test' })).toThrow(
      Schema.SchemaError,
    );
  });

  it('authors and upgrades definitions through the renamed exports', () => {
    const identity = browser.makeModel({ name: 'item', abbreviation: 'itm' });
    const first = browser.makeModelVersion(identity, {
      version: '1.0.0',
      attributes: { name: browser.primitives.text() },
      indexes: [],
    });
    const next = browser.upgradeModelVersion(first, {
      version: '2.0.0',
      attributes: { quantity: browser.primitives.integer() },
    });
    expectTypeOf(next.version).toEqualTypeOf<'2.0.0'>();
    expectTypeOf(next.abbreviation).toEqualTypeOf<'itm'>();
    expect(Object.keys(first.attributes)).toEqual(['name']);
    expect(Object.keys(next.attributes)).toEqual(['name', 'quantity']);
    expect(browser.prefixId(next, 'fixed')).toBe('itm_fixed');
    expect(() => browser.prefixId(next, 'itm_fixed')).toThrow('already starts');
    expect(
      Effect.runSync(
        browser
          .makeId(next)
          .pipe(
            Effect.provideService(browser.CuidFactory, () =>
              Effect.succeed('fixed'),
            ),
          ),
      ),
    ).toBe('itm_fixed');
    expect(browser.makeAggregateId({ id: 'fixed' })).toBe('acct_fixed');

    const upgradedContract = browser.upgradeContractVersion(change, {
      version: '2.0.0',
      payload: { quantity: browser.primitives.integer() },
      up: ({ payload }) => Effect.succeed({ ...payload, quantity: 1 }),
      program: () => Effect.succeed({}),
    });
    expectTypeOf(upgradedContract.version).toEqualTypeOf<'2.0.0'>();
    const upgradedAggregate = sdk.upgradeAggregateVersion(aggregate, {
      version: '4.0.0',
      contracts: { change: { contract: upgradedContract } },
    });
    expectTypeOf(upgradedAggregate.version).toEqualTypeOf<'4.0.0'>();
    expect(upgradedAggregate.contracts.change.contract).toBe(upgradedContract);
    expect(upgradedAggregate.authentication).toEqual(aggregate.authentication);
  });
});
