import { RoutePattern } from '@remix-run/route-pattern';
import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateVersion } from '@zerospin/core/aggregate/makeAggregateVersion';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/makeContractVersion';
import { makeService } from '@zerospin/core/service/makeService';
import { makeSystem } from '@zerospin/core/system/makeSystem';
import { makeSystemConfig } from '@zerospin/core/system/makeSystemConfig';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

const createUser = makeContractVersion(defineContract('createUser'), {
  version: '1.0.0',
  payload: { name: primitives.text() },
});
const createProduct = makeContractVersion(defineContract('createProduct'), {
  version: '1.0.0',
  payload: { name: primitives.text() },
});

export const system = makeSystem({
  name: 'typed-config-fixture',
  aggregates: {
    user: [
      makeAggregateVersion(defineAggregate({ name: 'user' }), {
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
        version: '2.0.0',
        models: {},
        contracts: { createProduct },
      }),
    ],
  },
});

export default makeSystemConfig(system, {
  systemId: 'sys_typed_config_fixture',
});
