import { aggregates } from '@zerospin/core/aggregate/index';
import { authentication } from '@zerospin/core/authentication/index';
import { contracts } from '@zerospin/core/contracts/index';
import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { models } from '@zerospin/core/models/index';
import { makeModelIdSchema } from '@zerospin/core/models/makeIdSchema';
import { makeSelection } from '@zerospin/core/models/makeSelection';
import type { IAggregateId } from '@zerospin/core/models/types';
import { makeSystem } from '@zerospin/core/system/makeSystem';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

export const UserModel = models.makeModel({
  name: 'user',
  abbreviation: 'usr',
});

export const User = models.makeVersion(UserModel, {
  attributes: {
    name: primitives.text(),
  },
  indexes: [],
  version: '1.0.0',
});

export const Account = models.makeVersion(
  models.makeModel({ name: 'account', abbreviation: 'acct' }),
  {
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
);

export const ListModel = models.makeModel({
  name: 'list',
  abbreviation: 'lst',
});

export const List = models.makeVersion(ListModel, {
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

export const ItemModel = models.makeModel({
  name: 'item',
  abbreviation: 'tsk',
});

export const Item = models.makeVersion(ItemModel, {
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

export const createList = contracts.makeVersion(
  contracts.makeCommand('createList'),
  {
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
  },
);

export const createItem = contracts.makeVersion(
  contracts.makeCommand('createItem'),
  {
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
  },
);

export const deleteList = contracts.makeVersion(
  contracts.makeCommand('deleteList'),
  {
    payload: {
      id: primitives.foreignKey({ abbreviation: ListModel.abbreviation }),
    },

    models: { list: List },
    program: ({ payload, models }) => {
      const { id } = payload;
      return Effect.all({
        deleted: models.list.delete({
          resourceId: id,
        }),
      });
    },
    version: '1.0.0',
  },
);

export const moveItem = contracts.makeVersion(
  contracts.makeCommand('moveItem'),
  {
    payload: {
      id: primitives.foreignKey({ abbreviation: ItemModel.abbreviation }),
      prevListId: primitives.foreignKey({
        abbreviation: ListModel.abbreviation,
      }),
      nextListId: primitives.foreignKey({
        abbreviation: ListModel.abbreviation,
      }),
    },

    models: { item: Item },
    program: ({ payload, models }) => {
      const { id, prevListId, nextListId } = payload;
      return Effect.all({
        moved: models.item.move({
          resourceId: id,
          property: 'listId',
          prevId: prevListId,
          nextId: nextListId,
        }),
      });
    },
    version: '1.0.0',
  },
);

export const updateList = contracts.makeVersion(
  contracts.makeCommand('updateList'),
  {
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
  },
);

export const authenticationSignature = {
  version: '1.0.0',
  signature: Schema.Struct({
    userId: makeModelIdSchema(User),
  }),
};

export const main = makeFrontendController({
  aggregateVersion: '1.0.0',
  contracts: {
    deleteList: { contract: deleteList },
    createList: {
      contract: createList,
    },
    createItem: { contract: createItem },
    moveItem: { contract: moveItem },
    updateList: { contract: updateList },
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
    authentication.makeVersion({
      version: authenticationSignature.version,
      signature: authenticationSignature.signature,
      authenticate: ({ signature }) => Effect.succeed(signature.userId),
    }),
  ],
  aggregates: {
    user: [
      aggregates.makeVersion(aggregates.makeAggregate({ name: 'user' }), {
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
          deleteList: { contract: deleteList },
          createList: { contract: createList },
          createItem: { contract: createItem },
          moveItem: { contract: moveItem },
          updateList: { contract: updateList },
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
  services: {},
  name: 'system-worker',
});

export const config = system.config({ systemId: 'sys_local_plan071' });
