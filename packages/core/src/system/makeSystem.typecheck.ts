import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import { aggregates } from '../aggregate/index.ts';
import { authentication } from '../authentication/index.ts';
import { makeService } from '../service/makeService.ts';

import { makeSystem } from './makeSystem.ts';
import { makeSystemSpec } from './makeSystemSpec.ts';

const authenticationSignature = {
  version: '1.0.0',
  signature: Schema.Struct({ userId: Schema.String }),
};
const authenticationV1 = authentication.makeVersion({
  version: authenticationSignature.version,
  signature: authenticationSignature.signature,
  authenticate: ({
    signature,
  }: {
    signature: Schema.Schema.Type<typeof authenticationSignature.signature>;
  }) => Effect.succeed(signature.userId),
});

const catalog = makeService({
  name: 'catalog',
  version: '1.0.0',
  models: {},
  contracts: {},
  queries: {
    products: {
      paramsSchema: Schema.Struct({}),
      query: () => Effect.succeed([] as string[]),
    },
  },
  frontends: {},
});
const user = aggregates.makeVersion(
  aggregates.makeAggregate({ name: 'user' }),
  {
    version: '1.0.0',
    models: {},
    contracts: {},
    selections: {},
  },
);
const system = makeSystem({
  name: 'test',
  authentication: [authenticationV1],
  aggregates: { user: [user] },
  services: { catalog: [catalog] },
});

assert<Equals<typeof system.name, 'test'>>();
assert<Equals<(typeof system.aggregates.user)['1.0.0']['name'], 'user'>>();
assert<Equals<(typeof system.services.catalog)['1.0.0']['name'], 'catalog'>>();

// @ts-expect-error systems are immutable after construction
system.name = 'test';
// @ts-expect-error system authentication is immutable after construction
system.authentication[0].authenticate = authenticationV1.authenticate;
// @ts-expect-error system aggregate registries are immutable after construction
system.aggregates.user = { ...system.aggregates.user };
// @ts-expect-error system service registries are immutable after construction
system.services.catalog = { ...system.services.catalog };
// @ts-expect-error resolved service query definitions are immutable
system.services.catalog['1.0.0'].queries.products.name = 'products';

const spec = makeSystemSpec({ system });
// @ts-expect-error generated system specs are immutable
spec.systemName = 'test';
// @ts-expect-error generated authentication specs are immutable
spec.authentication[0]!.version = '1.0.0';
// @ts-expect-error generated aggregate spec registries are immutable
spec.aggregates.user = { ...spec.aggregates.user };
// @ts-expect-error generated authentication JSON Schema roots are immutable
spec.authentication[0]!.signatureJsonSchema.schema.type = 'string';
// @ts-expect-error generated query JSON Schema roots are immutable
spec.services.catalog.queries.products.paramsJsonSchema.schema.type = 'string';

makeSystem({
  name: 'test',
  authentication: [authenticationV1],
  aggregates: {},
});

makeSystem({
  name: 'key-test',
  authentication: [authenticationV1],
  aggregates: {
    // @ts-expect-error aggregate registry keys must equal aggregate.name
    account: [user],
  },
  services: { catalog: [catalog] },
});

makeSystem({
  name: 'key-test',
  authentication: [authenticationV1],
  aggregates: {},
  services: {
    // @ts-expect-error service registry keys must equal service.name
    inventory: [catalog],
  },
});

// Note: controller.systemName is not checked at compile-time in makeSystem because
// makeService cannot carry SYSTEM_NAME through its controller constraint
// — the literal is erased during FRONTENDS inference. systemName correctness is enforced
// at runtime instead.
