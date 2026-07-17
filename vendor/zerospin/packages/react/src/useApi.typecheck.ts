import { makeActorApi } from '@zerospin/core/actorController/makeActorApi';
import { makeActorController } from '@zerospin/core/actorController/makeActorController';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeServiceController } from '@zerospin/core/service/makeServiceController';
import type { IAnyError } from '@zerospin/error';
import { Effect, Schema, type Either } from 'effect';

import { makeReactFrontend } from './makeReactFrontend';
import { useApi } from './useApi';

const service = makeServiceController({
  name: 'catalog',
  version: '1.0.0',
  models: {},
  contracts: {},
  queries: {
    getProducts: {
      paramsSchema: Schema.Struct({
        limit: Schema.Number,
      }),
      query: Effect.fn('getProducts')(function* ({ params }) {
        yield* Effect.void;

        return {
          total: params.limit,
        };
      }),
    },
  },
});

const actorApi = makeActorApi({
  getProducts: service.queries.getProducts,
});

const shopperFrontend = makeFrontendController({
  contracts: {},
  models: {},
  accountName: 'user',
  actorName: 'shopper',
  frontendName: 'web',
  version: '1.0.0',
  systemName: 'react-use-api-typecheck',
  signature: Schema.Struct({}),
});

const wrongFrontend = makeFrontendController({
  contracts: {},
  models: {},
  accountName: 'user',
  actorName: 'admin',
  frontendName: 'web',
  version: '1.0.0',
  systemName: 'react-use-api-typecheck',
  signature: Schema.Struct({}),
});

const shopperActor = makeActorController({
  name: 'shopper',
  version: '1.0.0',
  api: actorApi,
  models: {},
  selections: {},
  frontends: {
    web: {
      frontendController: shopperFrontend,
      authenticate: () =>
        Effect.succeed({
          accountId: 'acct_1',
          actorId: 'actr_1',
        }),
    },
  },
});

const actorWithoutApi = makeActorController({
  name: 'shopper',
  version: '1.0.0',
  models: {},
  selections: {},
  frontends: {
    web: {
      frontendController: shopperFrontend,
      authenticate: () =>
        Effect.succeed({
          accountId: 'acct_1',
          actorId: 'actr_1',
        }),
    },
  },
});

const ReactShopper = makeReactFrontend({
  frontend: shopperFrontend,
});

const WrongReactFrontend = makeReactFrontend({
  frontend: wrongFrontend,
});

function UseApiTypecheckProbe() {
  const api = useApi<typeof shopperActor>(ReactShopper);

  const result: Promise<Either.Either<{ total: number }, IAnyError>> =
    api.executeActorQuery({
      queryName: 'getProducts',
      params: {
        limit: 10,
      },
    });

  void result;

  // @ts-expect-error CoreTypeError — frontend actorName must match actor.name
  useApi<typeof shopperActor>(WrongReactFrontend);

  // @ts-expect-error CoreTypeError — actor must configure an actor API
  useApi<typeof actorWithoutApi>(ReactShopper);

  api.executeActorQuery({
    // @ts-expect-error CoreTypeError — queryName must be an actor API query key
    queryName: 'missing',
    params: {
      limit: 10,
    },
  });

  api.executeActorQuery({
    queryName: 'getProducts',
    // @ts-expect-error CoreTypeError — params must match query paramsSchema
    params: {},
  });

  return null;
}

void UseApiTypecheckProbe;
