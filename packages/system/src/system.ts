import { makeAggregate } from '@zerospin/core/aggregate/makeAggregate';
import { makeAggregateVersion } from '@zerospin/core/aggregate/makeVersion';
import { makeAuthenticationVersion } from '@zerospin/core/authentication/makeVersion';
import { defineCommand } from '@zerospin/core/contracts/Command';
import { makeContractVersion } from '@zerospin/core/contracts/makeVersion';
import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeModelIdSchema } from '@zerospin/core/models/makeIdSchema';
import { makeModel, makeModelVersion } from '@zerospin/core/models/makeModel';
import { makeSelection } from '@zerospin/core/models/makeSelection';
import type { IAggregateId } from '@zerospin/core/models/types';
import { makeSystem } from '@zerospin/core/system/makeSystem';
import { makeSystemConfig } from '@zerospin/core/system/makeSystemConfig';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

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

export const deleteList = makeContractVersion(defineCommand('deleteList'), {
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
});

export const moveItem = makeContractVersion(defineCommand('moveItem'), {
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
    makeAuthenticationVersion({
      version: authenticationSignature.version,
      signature: authenticationSignature.signature,
      authenticate: ({ signature }) => Effect.succeed(signature.userId),
    }),
  ],
  aggregates: {
    user: [
      makeAggregateVersion(makeAggregate({ name: 'user' }), {
        version: '1.0.0',
        authorize: (props: {
          identityKey: string;
          aggregateId: IAggregateId;
          db: Readonly<
            Pick<
              IDb<IResourceDbConfig<typeof mainModels, Record<never, never>>>,
              'query'
            >
          >;
        }) => {
          const { db, identityKey: requestedIdentityKey } = props;
          return Effect.gen(function* () {
            const userId = yield* Schema.decodeUnknownEffect(
              makeModelIdSchema(User),
            )(requestedIdentityKey).pipe(
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
                message: `User ${requestedIdentityKey} was not found`,
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
            where: ({ identityKey }) => ({ id: identityKey }),
          }),
          list: makeSelection({
            model: List,
            where: ({ identityKey }) => ({
              user: { id: identityKey },
            }),
          }),
          item: makeSelection({
            model: Item,
            where: ({ identityKey }) => ({
              list: { user: { id: identityKey } },
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

export const config = makeSystemConfig(system, {
  systemId: 'sys_local_plan071',
});
