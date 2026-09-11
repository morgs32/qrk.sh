import { mapParseError, ZerospinError } from '@zerospin/error';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { makeAggregate } from '../aggregate/makeAggregate.ts';
import { makeAggregateVersion } from '../aggregate/makeVersion.ts';
import { makeAuthenticationVersion } from '../authentication/makeVersion.ts';
import { defineCommand } from '../contracts/Command.ts';
import { makeContractVersion } from '../contracts/makeVersion.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import { getFrontendDbModels } from '../frontendController/getFrontendDbModels.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { makeModelIdSchema } from '../models/makeIdSchema.ts';
import { makeModel, makeModelVersion } from '../models/makeModel.ts';
import { makeSelection } from '../models/makeSelection.ts';
import type { IAggregateId } from '../models/types.ts';
import { makeSystem } from '../system/makeSystem.ts';

export const UserModel = makeModel({
  name: 'user',
  abbreviation: 'usr',
});

export const User = makeModelVersion(UserModel, {
  attributes: {
    name: primitives.text(),
  },
  indexes: [],
  version: '1.0.0',
});

export const Account = makeModelVersion(
  makeModel({ name: 'account', abbreviation: 'acct' }),
  {
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
);

export const ListModel = makeModel({
  name: 'list',
  abbreviation: 'lst',
});

export const List = makeModelVersion(ListModel, {
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
});

export const ItemModel = makeModel({
  name: 'item',
  abbreviation: 'tsk',
});

export const Item = makeModelVersion(ItemModel, {
  attributes: {
    listId: primitives.ref({
      table: List.table,
      relation: 'list',
      inverse: 'items',
    }),
    name: primitives.text(),
  },
  indexes: [],
  version: '1.0.0',
});

export const createList = makeContractVersion(defineCommand('createList'), {
  guard: ({ payload }: { payload: { name: string } }) =>
    Effect.gen(function* () {
      if (payload.name === 'invalid-name') {
        return yield* new ZerospinError({
          code: 'list-name-rejected',
          message: `List name is rejected: ${payload.name}`,
        });
      }
    }).pipe(Effect.withSpan('createListGuard')),

  payload: {
    id: primitives.foreignKey({ abbreviation: ListModel.abbreviation }),
    name: primitives.text(),
    userId: primitives.foreignKey({ abbreviation: UserModel.abbreviation }),
  },

  models: { list: List },
  program: ({ payload, models }) => {
    const { id, name, userId } = payload;
    return Effect.all({
      created: models.list.create({
        resourceId: id,
        attributes: {
          name,
          userId,
        },
      }),
    });
  },
  version: '1.0.0',
});

export const createItem = makeContractVersion(defineCommand('createItem'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: ItemModel.abbreviation }),
    listId: primitives.foreignKey({ abbreviation: ListModel.abbreviation }),
    name: primitives.text(),
  },

  models: { item: Item },
  program: ({ payload, models }) => {
    const { id, listId, name } = payload;
    return Effect.all({
      created: models.item.create({
        resourceId: id,
        attributes: {
          listId,
          name,
        },
      }),
    });
  },
  version: '1.0.0',
});

export const updateList = makeContractVersion(defineCommand('updateList'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: ListModel.abbreviation }),
    name: primitives.text(),
    userId: primitives.foreignKey({ abbreviation: UserModel.abbreviation }),
  },

  models: { list: List },
  program: ({ payload, models }) => {
    const { id, name, userId } = payload;
    return Effect.all({
      updated: models.list.update({
        resourceId: id,
        attributes: { name, userId },
      }),
    });
  },
  version: '1.0.0',
});

export const deleteList = makeContractVersion(defineCommand('deleteList'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: ListModel.abbreviation }),
  },

  models: { list: List },
  program: ({ payload, models }) =>
    Effect.all({
      deleted: models.list.delete({
        resourceId: payload.id,
      }),
    }),
  version: '1.0.0',
});

export const authenticationSignature = {
  version: '1.0.0',
  signature: Schema.Struct({
    userId: makeModelIdSchema(User),
  }),
};

export const main = makeFrontendController({
  aggregateVersion: '1.0.0',
  contracts: {
    createList: {
      contract: createList,
    },
    createItem: { contract: createItem },
    updateList: { contract: updateList },
    deleteList: { contract: deleteList },
  },
  aggregateName: 'user',
  name: 'main',
  systemName: 'system-worker',
  models: {
    account: Account,
    list: List,
    item: Item,
    user: User,
  },
});

export const mainModels = getFrontendDbModels(main);

export const system = makeSystem({
  authentication: [
    makeAuthenticationVersion({
      version: authenticationSignature.version,
      signature: authenticationSignature.signature,
      authenticate: ({ signature }) => Effect.succeed(signature.userId),
    }),
  ],
  services: {},
  aggregates: {
    user: [
      makeAggregateVersion(makeAggregate({ name: 'user' }), {
        version: '1.0.0',
        authorize: (props: {
          userId: string;
          aggregateId: IAggregateId;
          db: Readonly<
            Pick<
              IDb<IResourceDbConfig<typeof mainModels, Record<never, never>>>,
              'query'
            >
          >;
        }) => {
          const { db, userId: requestedUserId } = props;
          return Effect.gen(function* () {
            const userId = yield* Schema.decodeUnknownEffect(
              makeModelIdSchema(User),
            )(requestedUserId).pipe(
              mapParseError({
                code: 'fixture-user-id-invalid',
                prefix: 'Failed to decode the fixture authorization userId',
              }),
            );
            const user = yield* Effect.try({
              try: () =>
                db.query.user
                  .findFirst({
                    where: { id: { eq: userId } },
                  })
                  .sync(),
              catch: cause =>
                new ZerospinError({
                  code: 'fixture-user-query-failed',
                  message:
                    'Failed to query the fixture user during authentication.',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
            });
            if (user === undefined) {
              return yield* new ZerospinError({
                code: 'user-not-found',
                message: `User ${requestedUserId} was not found`,
              });
            }
            return yield* Effect.void;
          });
        },
        models: {
          user: User,
          list: List,
          item: Item,
          account: Account,
        },
        contracts: {
          createList: { contract: createList },
          createItem: { contract: createItem },
          updateList: { contract: updateList },
          deleteList: { contract: deleteList },
        },
        selections: {
          user: makeSelection({
            model: User,
            where: ({ userId }) => ({ id: userId }),
          }),
          list: makeSelection({
            model: List,
            where: ({ userId }) => ({
              user: { id: userId },
            }),
          }),
          item: makeSelection({
            model: Item,
            where: ({ userId }) => ({
              list: { user: { id: userId } },
            }),
          }),
          account: makeSelection({
            model: Account,
            where: () => ({}),
          }),
        },
      }),
    ],
  },
  name: 'system-worker',
});

export const userAggregate = system.aggregates.user['1.0.0'];
