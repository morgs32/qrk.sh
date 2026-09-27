import { RoutePattern } from '@remix-run/route-pattern';
import {
  makeZerospinError,
  mapParseError,
  prettyUnknownFailure,
} from '@zerospin/error';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { defineAggregate } from '../aggregate/defineAggregate.ts';
import { makeAggregateVersion } from '../aggregate/make/makeAggregateVersion.ts';
import { defineAggregateActor } from '../aggregateActor/defineAggregateActor.ts';
import { makeAggregateActorVersion } from '../aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion.ts';
import { makeAggregateSessionDefinition } from '../aggregateSession/make/makeAggregateSessionDefinition.ts';
import { defineContract } from '../contracts/defineContract.ts';
import { makeContractVersion } from '../contracts/make/makeContractVersion.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import { makeActorIdentity } from '../identity/make/makeActorIdentity/makeActorIdentity.ts';
import { defineModel } from '../models/defineModel.ts';
import { makeActorDbVersion } from '../models/make/makeActorDbVersion.ts';
import { makeModelIdSchema } from '../models/make/makeModelIdSchema.ts';
import { makeModelVersion } from '../models/make/makeModelVersion.ts';
import { makeSystem } from '../system/make/makeSystem/makeSystem.ts';

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

export const deleteList = makeContractVersion(defineContract('deleteList'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: listModel.abbreviation }),
  },

  models: { list },
  program: ({ payload, models }) =>
    Effect.all([
      models.list.delete({
        resourceId: payload.id,
      }),
    ]),
  version: '1.0.0',
});

const credentialsSchema = Schema.Struct({
  userId: makeModelIdSchema(userVersion),
});

export const main = {
  ...makeAggregateSessionDefinition({
    actorName: 'default',
    actorVersion: '1.0.0',
    aggregateVersion: '1.0.0',
    contracts: {
      createList: {
        contract: createList,
      },
      createItem: { contract: createItem },
      updateList: { contract: updateList },
      deleteList: { contract: deleteList },
    },
    identitySchema: Schema.Struct({
      aggregateId: Schema.String,
      userId: Schema.String,
    }),
    aggregateName: 'user',
    sessionName: 'main',
    models: {
      account,
      list,
      item,
      user: userVersion,
    },
  }),
  systemName: 'system-worker',
};

export const mainModels = main.models;

const actorDb1 = makeActorDbVersion({
  models: { user: userVersion, list, item, account },
});
const actorIdentity1 = makeActorIdentity({
  schema: Schema.Struct({
    aggregateId: Schema.String,
    userId: Schema.String,
  }),
  actorPath: RoutePattern.parse('/:userId'),
});
export const system = makeSystem({
  services: {},
  aggregates: {
    user: {
      '1.0.0': makeAggregateVersion(defineAggregate({ name: 'user' }), {
        version: '1.0.0',

        models: { user: userVersion, list, item, account },
        contracts: { createList, createItem, updateList, deleteList },
        automations: {},
        actors: {
          default: makeAggregateActorVersion(
            defineAggregateActor({ name: 'default' }),
            {
              authentication: {
                credentialsSchema,
                authenticate: ({ credentials }) =>
                  Effect.succeed({
                    aggregateId: 'acct_1',
                    userId: credentials.userId,
                  }),
              },
              version: '1.0.0',
              contracts: { createList, createItem, updateList, deleteList },
              authorize: (props: {
                identity: Readonly<Record<string, unknown>>;
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
                const { db, identity } = props;
                const requestedIdentityKey = identity.userId;
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
  name: 'system-worker',
});

export const userAggregate = system.aggregates.user['1.0.0'];
