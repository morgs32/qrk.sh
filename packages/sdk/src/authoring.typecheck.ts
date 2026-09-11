import { RoutePattern } from '@remix-run/route-pattern';
import { Effect, Schema } from 'effect';
import { expectTypeOf } from 'vitest';

import * as browser from './browser/index.js';

import * as sdk from './index.js';

const command = sdk.defineCommand('rename');
const contract = sdk.makeContractVersion(command, {
  version: '1.0.0',
  payload: { name: sdk.primitives.text() },
});
const aggregate = sdk.makeAggregateVersion(
  sdk.makeAggregate({ name: 'shopper' }),
  {
    version: '1.0.0',
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
    contracts: { rename: { contract } },
    selections: {},
  },
);
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
  version: '1.0.0',
  models: {},
  contracts: { rename: contract },
});

// @ts-expect-error Aggregate destinations require both aggregateId and systemName.
sdk.makeCommand(aggregate, {
  contractName: 'rename',
  payload: { name: 'Ada' },
});
// prettier-ignore
// @ts-expect-error Aggregate IDs retain their prefix.
sdk.makeCommand(aggregate, { contractName: 'rename', aggregateId: 'invalid', systemName: 'shopping', payload: { name: 'Ada' }, });
// @ts-expect-error Aggregate destinations require a system name.
sdk.makeCommand(aggregate, {
  contractName: 'rename',
  aggregateId: 'acct_a',
  payload: { name: 'Ada' },
});
// @ts-expect-error Service commands do not accept aggregate destinations.
sdk.makeCommand(service, {
  contractName: 'rename',
  aggregateId: 'acct_a',
  systemName: 'shopping',
  payload: { name: 'Ada' },
});
Effect.runSync(
  // @ts-expect-error Command IDs require the configured CuidFactory.
  sdk.makeCommand(service, {
    contractName: 'rename',
    payload: { name: 'Ada' },
  }),
);
// @ts-expect-error Raw strings are not branded command identities.
sdk.makeContractVersion('rename', { version: '1.0.0', payload: {} });
// @ts-expect-error Server authoring is absent from the browser entrypoint.
void browser.makeService;
// @ts-expect-error Owner command construction is absent from the browser entrypoint.
void browser.makeCommand;
// @ts-expect-error Runtime session construction is internal.
void sdk.makeAggregateSession;
// @ts-expect-error Component utility namespaces are removed.
void sdk.models;

const model = browser.makeModelVersion(
  browser.makeModel({ name: 'item', abbreviation: 'itm' }),
  {
    version: '1.0.0',
    attributes: { name: browser.primitives.text() },
    indexes: [],
  },
);
expectTypeOf<sdk.Command<'rename'>>().toExtend<string>();
expectTypeOf<sdk.IContractBinding>().toBeObject();
expectTypeOf<sdk.IAnyContractBindings>().toBeObject();
expectTypeOf<sdk.IAggregateFrontend<typeof aggregate>>().toBeObject();
expectTypeOf<sdk.IServiceFrontend<typeof service>>().toBeObject();
expectTypeOf<sdk.InferResource<typeof model>>().toBeObject();
expectTypeOf<sdk.InferPayloadInput<typeof contract.payload>>().toBeObject();
expectTypeOf<sdk.InferCommandPayload<typeof contract.payload>>().toBeObject();
expectTypeOf<sdk.ICommand>().toBeObject();
expectTypeOf<sdk.IServiceCommand>().toBeObject();
expectTypeOf<sdk.IAggregateCommand>().toBeObject();
expectTypeOf<sdk.IAggregateId>().toExtend<string>();
expectTypeOf<sdk.ISystemId>().toExtend<string>();
expectTypeOf<sdk.ISystemConfig>().toBeObject();
expectTypeOf<sdk.IDb>().toBeObject();
expectTypeOf<sdk.IResourceDbConfig>().toBeObject();
expectTypeOf<sdk.IAnyError>().toBeObject();
expectTypeOf<sdk.IZerospinError>().toBeObject();
expectTypeOf<browser.ICommand>().toEqualTypeOf<sdk.ICommand>();
expectTypeOf<browser.ISystemConfig>().toEqualTypeOf<sdk.ISystemConfig>();
