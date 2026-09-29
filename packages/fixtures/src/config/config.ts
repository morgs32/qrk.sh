import { RoutePattern } from '@remix-run/route-pattern';
import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateVersion } from '@zerospin/core/aggregate/make/makeAggregateVersion';
import { defineAggregateActor } from '@zerospin/core/aggregateActor/defineAggregateActor';
import { makeAggregateActorVersion } from '@zerospin/core/aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';
import { makeModelIdSchema } from '@zerospin/core/models/make/makeModelIdSchema';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeSystemConfig } from '@zerospin/core/system/make/makeSystemConfig';
import {
  makeZerospinError,
  mapParseError,
  prettyUnknownFailure,
} from '@zerospin/error';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

export const userModel = defineModel({
  name: 'user',
  abbreviation: 'usr',
});

export const userVersion = makeModelVersion(userModel, {
  attributes: {
    name: primitives.text(),
  },
  indexes: [],
  version: '1.0.0',
});

export const account = makeModelVersion(
  defineModel({ name: 'account', abbreviation: 'acct' }),
  {
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
);

export const listModel = defineModel({
  name: 'list',
  abbreviation: 'lst',
});

export const list = makeModelVersion(listModel, {
  attributes: {
    name: primitives.text(),
    userId: primitives.ref({
      table: userVersion.table,
      relation: 'user',
      inverse: 'lists',
    }),
  },
  indexes: [],
  version: '1.0.0',
});

export const itemModel = defineModel({
  name: 'item',
  abbreviation: 'tsk',
});

export const item = makeModelVersion(itemModel, {
  attributes: {
    listId: primitives.ref({
      table: list.table,
      relation: 'list',
      inverse: 'items',
    }),
    name: primitives.text(),
  },
  indexes: [],
  version: '1.0.0',
});

export const createList = makeContractVersion(defineContract('createList'), {
  guard: ({ payload }: { payload: { name: string } }) =>
    Effect.gen(function* () {
      if (payload.name === 'invalid-name') {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'list-name-rejected',
            message: `List name is rejected: ${payload.name}`,
          }),
        );
      }
    }).pipe(Effect.withSpan('createListGuard')),
  payload: {
    id: primitives.foreignKey({ abbreviation: listModel.abbreviation }),
    name: primitives.text(),
    userId: primitives.foreignKey({ abbreviation: userModel.abbreviation }),
  },

  models: { list },
  program: ({ payload, models }) => {
    const { id, name, userId } = payload;
    return Effect.all([
      models.list.create({
        resourceId: id,
        attributes: {
          name,
          userId,
        },
      }),
    ]);
  },
  version: '1.0.0',
});

export const createItem = makeContractVersion(defineContract('createItem'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: itemModel.abbreviation }),
    listId: primitives.foreignKey({ abbreviation: listModel.abbreviation }),
    name: primitives.text(),
  },

  models: { item },
  program: ({ payload, models }) => {
    const { id, listId, name } = payload;
    return Effect.all([
      models.item.create({
        resourceId: id,
        attributes: {
          listId,
          name,
        },
      }),
    ]);
  },
  version: '1.0.0',
});

export const deleteList = makeContractVersion(defineContract('deleteList'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: listModel.abbreviation }),
  },

  models: { list },
  program: ({ payload, models }) => {
    const { id } = payload;
    return Effect.all([
      models.list.delete({
        resourceId: id,
      }),
    ]);
  },
  version: '1.0.0',
});

export const moveItem = makeContractVersion(defineContract('moveItem'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: itemModel.abbreviation }),
    prevListId: primitives.foreignKey({
      abbreviation: listModel.abbreviation,
    }),
    nextListId: primitives.foreignKey({
      abbreviation: listModel.abbreviation,
    }),
  },

  models: { item },
  program: ({ payload, models }) => {
    const { id, prevListId, nextListId } = payload;
    return Effect.all([
      models.item.move({
        resourceId: id,
        property: 'listId',
        prevId: prevListId,
        nextId: nextListId,
      }),
    ]);
  },
  version: '1.0.0',
});

export const updateList = makeContractVersion(defineContract('updateList'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: listModel.abbreviation }),
    name: primitives.text(),
    userId: primitives.foreignKey({ abbreviation: userModel.abbreviation }),
  },

  models: { list },
  program: ({ payload, models }) => {
    const { id, name, userId } = payload;
    return Effect.all([
      models.list.update({
        resourceId: id,
        attributes: { name, userId },
      }),
    ]);
  },
  version: '1.0.0',
});

export const main = {
  kind: 'aggregate' as const,
  actorName: 'default',
  actorVersion: '1.0.0',
  claimsSchema: Schema.Struct({
    aggregateId: Schema.String,
    userId: makeModelIdSchema(userVersion),
  }),
  aggregateVersion: '1.0.0',
  contracts: {
    deleteList,
    createList,
    createItem,
    moveItem,
    updateList,
  },
  aggregateName: 'user',
  sessionName: 'main',
  models: {
    account,
    list,
    item,
    user: userVersion,
  },
  systemName: 'system-worker',
};

export const mainModels = main.models;

const actorDb1 = makeActorDbVersion({
  models: { user: userVersion, list, item, account },
});
const actorIdentity1 = makeActorIdentity({
  claims: Schema.Struct({
    aggregateId: Schema.String,
    userId: makeModelIdSchema(userVersion),
  }),
  actorPath: RoutePattern.parse('/:userId'),
});
export const system = makeSystem({
  aggregates: {
    user: {
      '1.0.0': makeAggregateVersion(defineAggregate({ name: 'user' }), {
        version: '1.0.0',

        models: { user: userVersion, list, item, account },
        contracts: {
          deleteList,
          createList,
          createItem,
          moveItem,
          updateList,
        },

        actors: {
          default: makeAggregateActorVersion(
            defineAggregateActor({ name: 'default' }),
            {
              authentication: 'none',
              contracts: {
                deleteList,
                createList,
                createItem,
                moveItem,
                updateList,
              },
              version: '1.0.0',
              authorize: (props: {
                claims: Readonly<Record<string, unknown>>;
                aggregateId: string;
                db: Readonly<
                  Pick<
                    IDb<
                      IResourceDbConfig<typeof mainModels, Record<never, never>>
                    >,
                    'query'
                  >
                >;
              }) => {
                const { db, claims } = props;
                const requestedIdentityKey = claims.userId;
                return Effect.gen(function* () {
                  const userId = yield* Schema.decodeUnknownEffect(
                    makeModelIdSchema(userVersion),
                  )(requestedIdentityKey).pipe(
                    mapParseError({
                      code: 'fixture-user-id-invalid',
                      prefix:
                        'Failed to decode the fixture authorization userId',
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
                      makeZerospinError({
                        code: 'fixture-user-query-failed',
                        message:
                          'Failed to query the fixture user during identity.',
                        cause: prettyUnknownFailure(cause),
                      }),
                  });
                  if (user === undefined) {
                    return yield* Effect.fail(
                      makeZerospinError({
                        code: 'user-not-found',
                        message: `User ${requestedIdentityKey} was not found`,
                      }),
                    );
                  }
                  return yield* Effect.void;
                });
              },
              db: actorDb1,
              identity: actorIdentity1,
              queries: {
                user: actorDb1.query['user'].findMany({
                  where: {
                    id: { eq: actorIdentity1.sql.placeholder('userId') },
                  },
                }),
                list: actorDb1.query['list'].findMany({
                  where: {
                    user: {
                      id: {
                        eq: actorIdentity1.sql.placeholder('userId'),
                      },
                    },
                  },
                }),
                item: actorDb1.query['item'].findMany({
                  where: {
                    list: {
                      user: {
                        id: {
                          eq: actorIdentity1.sql.placeholder('userId'),
                        },
                      },
                    },
                  },
                }),
                account: actorDb1.query['account'].findMany({}),
              },
            },
          ),
        },
      }),
    },
  },
  services: {},
  name: 'system-worker',
});

const config = makeSystemConfig(system, {
  systemId: 'sys_local_plan071',
});

// oxlint-disable-next-line import/no-default-export -- Matches the runtime config module interface.
export default config;
