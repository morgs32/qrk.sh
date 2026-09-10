import { aggregates } from '@zerospin/core/aggregate/index';
import { authentication } from '@zerospin/core/authentication/index';
import { contracts } from '@zerospin/core/contracts/index';
import { makeService } from '@zerospin/core/service/makeService';
import { makeSystem } from '@zerospin/core/system/makeSystem';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

const createUser = contracts.makeVersion(contracts.makeCommand('createUser'), {
  version: '1.0.0',
  payload: { name: primitives.text() },
});
const createProduct = contracts.makeVersion(
  contracts.makeCommand('createProduct'),
  {
    version: '1.0.0',
    payload: { name: primitives.text() },
  },
);

export const system = makeSystem({
  name: 'typed-config-fixture',
  authentication: [
    authentication.makeVersion({
      version: '1.0.0',
      signature: Schema.String,
      authenticate: ({ signature }) => Effect.succeed(signature),
    }),
  ],
  aggregates: {
    user: [
      aggregates.makeVersion(aggregates.makeAggregate({ name: 'user' }), {
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
        version: '2.0.0',
        models: {},
        contracts: { createProduct },
        frontends: {},
      }),
    ],
  },
});

export default system.config({ systemId: 'sys_typed_config_fixture' });
