import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeContract } from '../contracts/makeContract.ts';
import { makeContractAdapter } from '../contracts/makeContractAdapter.ts';
import type { IContract } from '../contracts/types.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { makeModel } from '../models/makeModel.ts';
import { makeSelection } from '../models/makeSelection.ts';
import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';
import { makeServiceController } from '../service/makeServiceController.ts';

import { makeActorApi } from './makeActorApi.ts';
import { makeActorController } from './makeActorController.ts';

const User = makeModel(
  {
    abbreviation: 'usr',
    modelName: 'user',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const List = makeModel(
  {
    abbreviation: 'lst',
    modelName: 'list',
    attributes: {
      name: primitives.text(),
      userId: primitives.ref({
        table: User.table,
        relation: 'user',
        inverse: 'lists',
      }),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const Product = makeServiceModel(
  {
    serviceName: 'catalog',
    abbreviation: 'prd',
    modelName: 'product',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const createList = makeContract({
  commandName: 'createList',
  payload: {
    id: List.primaryKey({ autogenerate: false }),
    name: primitives.text(),
    userId: User.primaryKey({ autogenerate: false }),
  },
  mutations: null,
  version: '1.0.0',
});

const createUser = makeContract({
  commandName: 'createUser',
  payload: {
    id: User.primaryKey({ autogenerate: false }),
    name: primitives.text(),
  },
  mutations: null,
  version: '1.0.0',
});

const frontend = makeFrontendController({
  contracts: {
    createList,
    createUser,
  },
  accountName: 'user',
  actorName: 'main',
  frontendName: 'main',
  version: '1.0.0',
  systemName: 'test',
  models: {
    list: List,
    user: User,
  },
  signature: Schema.Struct({ userId: Schema.String }),
});

const authenticate = () =>
  Effect.succeed({
    actorId: 'usr_1' as const,
    accountId: 'acct_1' as const,
  });

const selections = {
  list: makeSelection({ model: List }),
  user: makeSelection({ model: User }),
};

const versionedActorController = makeActorController({
  name: 'main',
  version: '1.0.0',
  models: { list: List, user: User },
  selections,
  frontends: {
    main: {
      frontendController: frontend,
      authenticate,
    },
  },
});

const actorControllerVersion: '1.0.0' = versionedActorController.version;
void actorControllerVersion;

// @ts-expect-error — version is required at the factory call site
makeActorController({
  name: 'main',
  models: { list: List, user: User },
  selections,
  frontends: {
    main: {
      frontendController: frontend,
      authenticate,
    },
  },
});

const _actorSuperset = makeActorController({
  name: 'main',
  version: '1.0.0',
  models: { list: List, product: Product, user: User },
  selections: {
    ...selections,
    product: makeSelection({ model: Product }),
  },
  frontends: {
    main: {
      frontendController: frontend,
      authenticate,
    },
  },
});

void _actorSuperset;

assert<
  Equals<
    Extract<
      Effect.Effect.Context<
        ReturnType<typeof _actorSuperset.frontends.main.authenticate>
      >,
      IContract
    >,
    never
  >
>();

const _actorWithOneAuthenticationContract = makeActorController({
  name: 'main',
  version: '1.0.0',
  models: { list: List, user: User },
  selections,
  frontends: {
    main: {
      frontendController: frontend,
      authenticate: ({ makeAccountCommand }) =>
        Effect.gen(function* () {
          yield* makeAccountCommand({
            contract: createList,
            payload: {
              id: List.prefixId('list-1'),
              name: 'List 1',
              userId: User.prefixId('user-1'),
            },
          });

          return yield* authenticate();
        }),
    },
  },
});

assert<
  Equals<
    Extract<
      Effect.Effect.Context<
        ReturnType<
          typeof _actorWithOneAuthenticationContract.frontends.main.authenticate
        >
      >,
      IContract
    >,
    typeof createList
  >
>();

const catalogService = makeServiceController({
  name: 'catalog',
  version: '1.0.0',
  models: { product: Product },
  contracts: {},
  queries: {
    listProducts: {
      paramsSchema: Schema.Struct({}),
      query: Effect.fn('listProducts')(function* ({ db }) {
        yield* Effect.void;
        return db.query.product.findMany().sync();
      }),
    },
  },
});

const actorApi = makeActorApi({
  listProducts: catalogService.queries.listProducts,
});

const _actorWithApi = makeActorController({
  name: 'main',
  version: '1.0.0',
  api: actorApi,
  models: { list: List, user: User },
  selections,
  frontends: {
    main: {
      frontendController: frontend,
      authenticate,
    },
  },
});

void _actorWithApi;

makeActorController({
  name: 'main',
  version: '1.0.0',
  models: { user: User },
  // @ts-expect-error CoreTypeError — selections key must equal model.modelName
  selections: { wrongKey: makeSelection({ model: User }) },
  frontends: {
    main: {
      frontendController: frontend,
      authenticate,
    },
  },
});

makeActorController({
  name: 'main',
  version: '1.0.0',
  models: { list: List },
  // @ts-expect-error CoreTypeError — ref target model must be in controller models
  selections: { list: makeSelection({ model: List }) },
  frontends: {
    main: {
      frontendController: frontend,
      authenticate,
    },
  },
});

// @ts-expect-error — selections is required
makeActorController({
  name: 'main',
  version: '1.0.0',
  models: { list: List, user: User },
  frontends: {
    main: {
      frontendController: frontend,
      authenticate,
    },
  },
});

makeActorController({
  name: 'main',
  version: '1.0.0',
  models: { list: List, user: User },
  selections,
  frontends: {
    main: {
      frontendController: frontend,
      authenticate,
      contractAdapters: {
        // @ts-expect-error — contractAdapters key must be a frontend contract
        missing: makeContractAdapter({
          contract: createList,
          adapt: ({ payload }) => Effect.succeed(payload),
        }),
      },
    },
  },
});
