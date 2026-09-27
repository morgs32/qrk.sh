import { RoutePattern } from '@remix-run/route-pattern';
import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateVersion } from '@zerospin/core/aggregate/make/makeAggregateVersion';
import { defineAggregateActor } from '@zerospin/core/aggregateActor/defineAggregateActor';
import { makeAggregateActorVersion } from '@zerospin/core/aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';
import { makeService } from '@zerospin/core/service/make/makeService';
import { defineServiceActor } from '@zerospin/core/serviceActor/defineServiceActor';
import { makeServiceActorVersion } from '@zerospin/core/serviceActor/make/makeServiceActorVersion';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeSystemConfig } from '@zerospin/core/system/make/makeSystemConfig';
import { primitives } from '@zerospin/schema';
import { Schema } from 'effect';

const createUser = makeContractVersion(defineContract('createUser'), {
  version: '1.0.0',
  payload: { name: primitives.text() },
});
const createProduct = makeContractVersion(defineContract('createProduct'), {
  version: '1.0.0',
  payload: { name: primitives.text() },
});

const actorDb2 = makeActorDbVersion({ models: {} });
const actorIdentity2 = makeActorIdentity({
  claims: Schema.Struct({
    userId: Schema.String,
    aggregateId: Schema.String,
  }),
  actorPath: RoutePattern.parse('/:userId'),
});
const actorDb1 = makeActorDbVersion({ models: {} });
const actorIdentity1 = makeActorIdentity({
  claims: Schema.Struct({
    userId: Schema.String,
    aggregateId: Schema.String,
  }),
  actorPath: RoutePattern.parse('/:userId'),
});
export const system = makeSystem({
  name: 'typed-config-fixture',
  aggregates: {
    user: {
      '2.0.0': makeAggregateVersion(defineAggregate({ name: 'user' }), {
        version: '2.0.0',
        models: {},
        contracts: { createUser },
        automations: {},

        actors: {
          default: makeAggregateActorVersion(
            defineAggregateActor({ name: 'default' }),
            {
              authentication: 'none',
              contracts: { createUser },
              version: '2.0.0',
              db: actorDb1,
              identity: actorIdentity1,
              queries: {},
            },
          ),
        },
      }),
    },
  },
  services: {
    app: makeService({
      actors: {
        '2.0.0': {
          default: makeServiceActorVersion(
            defineServiceActor({ name: 'default' }),
            {
              authentication: 'none',
              version: '1.0.0',
              db: actorDb2,
              identity: actorIdentity2,
              queries: {},
            },
          ),
        },
      },

      name: 'app',

      module: {
        '2.0.0': {
          models: {},
          contracts: { createProduct },
          automations: {},
        },
      },
    }),
  },
});

export default makeSystemConfig(system, {
  systemId: 'sys_typed_config_fixture',
});
