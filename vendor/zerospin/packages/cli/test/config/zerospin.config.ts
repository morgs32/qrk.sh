import { RoutePattern } from '@remix-run/route-pattern';
import { makeAggregate } from '@zerospin/core/aggregate/makeAggregate';
import { makeAggregateVersion } from '@zerospin/core/aggregate/makeVersion';
import { defineCommand } from '@zerospin/core/contracts/Command';
import { makeContractVersion } from '@zerospin/core/contracts/makeVersion';
import { makeService } from '@zerospin/core/service/makeService';
import { makeSystem } from '@zerospin/core/system/makeSystem';
import { makeSystemConfig } from '@zerospin/core/system/makeSystemConfig';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

const createUser = makeContractVersion(defineCommand('createUser'), {
  version: '1.0.0',
  payload: { name: primitives.text() },
});
const createProduct = makeContractVersion(defineCommand('createProduct'), {
  version: '1.0.0',
  payload: { name: primitives.text() },
});

export const system = makeSystem({
  name: 'typed-config-fixture',
  aggregates: {
    user: [
      makeAggregateVersion(makeAggregate({ name: 'user' }), {
        authentication: {
          signatureSchema: Schema.Struct({
            userId: Schema.String,
            aggregateId: Schema.String,
          }),
          authenticationSchema: Schema.Struct({
            userId: Schema.String,
            aggregateId: Schema.String,
          }),
          selectionSchema: Schema.Struct({ userId: Schema.String }),
          pattern: RoutePattern.parse('/:userId'),
          authenticate: ({ signature }) => Effect.succeed(signature),
        },
        version: '2.0.0',
        models: {},
        contracts: { createUser: { contract: createUser } },
        selections: {},
      }),
    ],
  },
  services: {
    app: [
      makeService({
        name: 'app',
        authentication: {
          signatureSchema: Schema.Struct({
            userId: Schema.String,
            aggregateId: Schema.String,
          }),
          authenticationSchema: Schema.Struct({
            userId: Schema.String,
            aggregateId: Schema.String,
          }),
          selectionSchema: Schema.Struct({ userId: Schema.String }),
          pattern: RoutePattern.parse('/:userId'),
          authenticate: ({ signature }) => Effect.succeed(signature),
        },
        version: '2.0.0',
        models: {},
        contracts: { createProduct },
        frontends: {},
      }),
    ],
  },
});

export default makeSystemConfig(system, {
  systemId: 'sys_typed_config_fixture',
});
