import { makeTable, primitives } from '@zerospin/schema';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { List, mainModels, User } from '../fixtures/system.ts';
import { models } from '../models/index.ts';
import { makeReplica } from '../models/makeReplica.ts';
import { sessionRepoTables } from '../session/sessionRepoTables.ts';

import { makeDbConfig, makeResourceDbConfig } from './makeDbConfig.ts';
import { makeProvisionedInMemoryWasmSqliteDb } from './makeProvisionedInMemoryWasmSqliteDb.ts';

describe('makeResourceDbConfig', () => {
  it('queries model refs in both forward and inverse directions', async () => {
    const dbConfig = makeResourceDbConfig({ models: mainModels });
    const db = await Effect.runPromise(
      makeProvisionedInMemoryWasmSqliteDb({
        dbConfig,
      }).pipe(Effect.provide(AsyncLive)),
    );

    try {
      const now = new Date('2026-07-13T00:00:00.000Z');
      db.insert(dbConfig.schema.user)
        .values({
          id: 'usr_relation',
          modelName: User.modelName,
          createdAt: now,
          updatedAt: now,
          version: User.version,
          name: 'Relation user',
        })
        .run();
      db.insert(dbConfig.schema.list)
        .values({
          id: 'lst_relation',
          modelName: List.modelName,
          createdAt: now,
          updatedAt: now,
          version: List.version,
          name: 'Relation list',
          userId: 'usr_relation',
        })
        .run();

      const storedList = db.query.list
        .findFirst({ with: { user: true } })
        .sync();
      const storedUser = db.query.user
        .findFirst({ with: { lists: true } })
        .sync();

      expect(storedList?.user?.id).toBe('usr_relation');
      expect(storedUser?.lists.map(list => list.id)).toEqual(['lst_relation']);
    } finally {
      await db.$client.sqlite3.close(db.$client.db);
    }
  });

  it('queries exact authoritative source-table refs between replicas', async () => {
    const ProductSource = models.makeVersion(
      models.makeModel({ name: 'product', abbreviation: 'prd' }),
      {
        attributes: { name: primitives.text() },
        indexes: [],
        version: '1.0.0',
      },
    );
    const CartItemSource = models.makeVersion(
      models.makeModel({ name: 'cartItem', abbreviation: 'cit' }),
      {
        attributes: {
          productId: primitives.ref({
            table: ProductSource.table,
            relation: 'product',
            inverse: 'cartItems',
          }),
        },
        indexes: [],
        version: '1.0.0',
      },
    );
    const ProductReplica = makeReplica({
      sourceModel: ProductSource,
      modelVersion: ProductSource.version,
      serviceName: 'catalog',
    });
    const CartItemReplica = makeReplica({
      sourceModel: CartItemSource,
      modelVersion: CartItemSource.version,
      serviceName: 'catalog',
    });
    const dbConfig = makeResourceDbConfig({
      models: {
        cartItem: CartItemReplica,
        product: ProductReplica,
      },
    });
    const db = await Effect.runPromise(
      makeProvisionedInMemoryWasmSqliteDb({
        dbConfig,
      }).pipe(Effect.provide(AsyncLive)),
    );

    try {
      const now = new Date('2026-08-30T00:00:00.000Z');
      db.insert(dbConfig.schema.product)
        .values({
          id: 'prd_replica_relation',
          modelName: ProductReplica.modelName,
          createdAt: now,
          updatedAt: now,
          version: ProductReplica.version,
          name: 'Replica product',
          deletedAt: null,
        })
        .run();
      db.insert(dbConfig.schema.cartItem)
        .values({
          id: 'cit_replica_relation',
          modelName: CartItemReplica.modelName,
          createdAt: now,
          updatedAt: now,
          version: CartItemReplica.version,
          productId: 'prd_replica_relation',
          deletedAt: null,
        })
        .run();

      const storedCartItem = db.query.cartItem
        .findFirst({ with: { product: true } })
        .sync();
      const storedProduct = db.query.product
        .findFirst({ with: { cartItems: true } })
        .sync();

      expect(storedCartItem?.product?.id).toBe('prd_replica_relation');
      expect(storedProduct?.cartItems.map(item => item.id)).toEqual([
        'cit_replica_relation',
      ]);
    } finally {
      await db.$client.sqlite3.close(db.$client.db);
    }
  });

  it('queries ordinary-table refs in both forward and inverse directions', async () => {
    const teams = makeTable({
      name: 'teams',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'team' }),
        name: primitives.text(),
      },
    });
    const members = makeTable({
      name: 'members',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'mbr' }),
        name: primitives.text(),
        teamId: primitives.ref({
          table: teams,
          relation: 'team',
          inverse: 'members',
        }),
      },
    });
    const dbConfig = makeDbConfig({ tables: { teams, members } });
    const db = await Effect.runPromise(
      makeProvisionedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );

    try {
      db.insert(dbConfig.schema.teams)
        .values({ id: 'team_relation', name: 'Relation team' })
        .run();
      db.insert(dbConfig.schema.members)
        .values({
          id: 'mbr_relation',
          name: 'Relation member',
          teamId: 'team_relation',
        })
        .run();

      const storedMember = db.query.members
        .findFirst({ with: { team: true } })
        .sync();
      const storedTeam = db.query.teams
        .findFirst({ with: { members: true } })
        .sync();

      expect(storedMember?.team?.id).toBe('team_relation');
      expect(storedTeam?.members.map(member => member.id)).toEqual([
        'mbr_relation',
      ]);
    } finally {
      await db.$client.sqlite3.close(db.$client.db);
    }
  });

  it('queries numeric-primary-key refs in both forward and inverse directions', async () => {
    const blocks = makeTable({
      name: 'blocks',
      shape: {
        blockIndex: primitives.integer({ primaryKey: true }),
        label: primitives.text(),
      },
    });
    const commands = makeTable({
      name: 'commands',
      shape: {
        commandId: primitives.primaryKey({ abbreviation: 'cmd' }),
        blockIndex: primitives.ref({
          table: blocks,
          relation: 'block',
          inverse: 'commands',
        }),
      },
    });
    const dbConfig = makeDbConfig({ tables: { blocks, commands } });
    const db = await Effect.runPromise(
      makeProvisionedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );

    try {
      db.insert(dbConfig.schema.blocks)
        .values({ blockIndex: 1, label: 'First block' })
        .run();
      db.insert(dbConfig.schema.commands)
        .values({ commandId: 'cmd_first', blockIndex: 1 })
        .run();

      const storedCommand = db.query.commands
        .findFirst({ with: { block: true } })
        .sync();
      const storedBlock = db.query.blocks
        .findFirst({ with: { commands: true } })
        .sync();

      expect(storedCommand?.block?.blockIndex).toBe(1);
      expect(storedBlock?.commands.map(command => command.commandId)).toEqual([
        'cmd_first',
      ]);
    } finally {
      await db.$client.sqlite3.close(db.$client.db);
    }
  });

  it('queries self refs in both forward and inverse directions', async () => {
    const categories = makeTable({
      name: 'categories',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'cat' }),
        name: primitives.text(),
        parentCategoryId: primitives.self({
          relation: 'parentCategory',
          inverse: 'childCategories',
          nullable: true,
        }),
      },
    });
    const dbConfig = makeDbConfig({ tables: { categories } });
    const db = await Effect.runPromise(
      makeProvisionedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );

    try {
      db.insert(dbConfig.schema.categories)
        .values({ id: 'cat_root', name: 'Root', parentCategoryId: null })
        .run();
      db.insert(dbConfig.schema.categories)
        .values({
          id: 'cat_child',
          name: 'Child',
          parentCategoryId: 'cat_root',
        })
        .run();

      const storedChild = db.query.categories
        .findFirst({
          where: { id: 'cat_child' },
          with: { parentCategory: true },
        })
        .sync();
      const storedRoot = db.query.categories
        .findFirst({
          where: { id: 'cat_root' },
          // @ts-expect-error self-inverse runtime relation is not represented by the construction marker type
          with: { childCategories: true },
        })
        .sync();

      expect(storedChild?.parentCategory?.id).toBe('cat_root');
      expect(Reflect.get(storedRoot ?? {}, 'childCategories')).toMatchObject([
        { id: 'cat_child' },
      ]);
    } finally {
      await db.$client.sqlite3.close(db.$client.db);
    }
  });

  it('keeps two logical model graphs in distinct physical table namespaces', async () => {
    const projectedUsers = makeTable({
      name: 'users',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'usr' }),
        label: primitives.text(),
      },
    });
    const projectedPosts = makeTable({
      name: 'posts',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'pst' }),
        userId: primitives.ref({
          table: projectedUsers,
          relation: 'user',
          inverse: 'posts',
        }),
      },
    });
    const sourceUsers = makeTable({
      name: 'users',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'usr' }),
        secret: primitives.text(),
      },
    });
    const sourcePosts = makeTable({
      name: 'posts',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'pst' }),
        userId: primitives.ref({
          table: sourceUsers,
          relation: 'user',
          inverse: 'posts',
        }),
      },
    });
    const dbConfig = makeDbConfig({
      tables: {
        projectedUsers,
        projectedPosts,
        sourceUsers,
        sourcePosts,
      },
      physicalTableNames: {
        sourceUsers: 'aggregateSource_users',
        sourcePosts: 'aggregateSource_posts',
      },
    });
    const db = await Effect.runPromise(
      makeProvisionedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );

    try {
      db.insert(dbConfig.schema.projectedUsers)
        .values({ id: 'usr_projected', label: 'Visible' })
        .run();
      db.insert(dbConfig.schema.projectedPosts)
        .values({ id: 'pst_projected', userId: 'usr_projected' })
        .run();
      db.insert(dbConfig.schema.sourceUsers)
        .values({ id: 'usr_source', secret: 'Canonical' })
        .run();
      db.insert(dbConfig.schema.sourcePosts)
        .values({ id: 'pst_source', userId: 'usr_source' })
        .run();

      expect(
        db.query.projectedPosts.findFirst({ with: { user: true } }).sync()
          ?.user,
      ).toMatchObject({ id: 'usr_projected', label: 'Visible' });
      expect(
        db.query.sourcePosts.findFirst({ with: { user: true } }).sync()?.user,
      ).toMatchObject({ id: 'usr_source', secret: 'Canonical' });
    } finally {
      await db.$client.sqlite3.close(db.$client.db);
    }
  });

  it('adds query builders for otherTables', async () => {
    const dbConfig = makeResourceDbConfig({
      models: mainModels,
      otherTables: sessionRepoTables,
    });
    const db = await Effect.runPromise(
      makeProvisionedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );

    try {
      expect(typeof db.query.commandJournal!.findMany).toBe('function');
      expect(db.query.commandJournal!.findMany().sync()).toEqual([]);
    } finally {
      await db.$client.sqlite3.close(db.$client.db);
    }
  });
});

describe('makeDbConfig table graph validation', () => {
  it('rejects a ref target outside the configured database', () => {
    const accounts = makeTable({
      name: 'accounts',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'acct' }),
      },
    });
    const users = makeTable({
      name: 'users',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'usr' }),
        accountId: primitives.ref({
          table: accounts,
          relation: 'account',
          inverse: 'users',
        }),
      },
    });

    expect(() => makeDbConfig({ tables: { users } })).toThrow(
      /targets table "accounts" outside this database/,
    );
  });

  it('rejects a missing ref target at runtime', () => {
    const accounts = makeTable({
      name: 'accounts',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'acct' }),
      },
    });
    const accountId = primitives.ref({
      table: accounts,
      relation: 'account',
      inverse: 'users',
    });
    Object.assign(accountId, { table: undefined });
    const users = makeTable({
      name: 'users',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'usr' }),
        accountId,
      },
    });

    expect(() => makeDbConfig({ tables: { accounts, users } })).toThrow(
      /targets table "accounts" outside this database/,
    );
  });

  it('rejects duplicate physical table names', () => {
    const first = makeTable({
      name: 'records',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'fst' }),
      },
    });
    const second = makeTable({
      name: 'records',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'snd' }),
      },
    });

    expect(() => makeDbConfig({ tables: { first, second } })).toThrow(
      /duplicate physical table name "records"/,
    );
  });

  it('rejects duplicate forward relation names', () => {
    const users = makeTable({
      name: 'users',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'usr' }),
      },
    });
    const posts = makeTable({
      name: 'posts',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'pst' }),
        authorId: primitives.ref({
          table: users,
          relation: 'user',
          inverse: 'authoredPosts',
        }),
        editorId: primitives.ref({
          table: users,
          relation: 'user',
          inverse: 'editedPosts',
        }),
      },
    });

    expect(() => makeDbConfig({ tables: { users, posts } })).toThrow(
      /duplicate relation name "posts.user"/,
    );
  });

  it('rejects duplicate inverse relation names', () => {
    const users = makeTable({
      name: 'users',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'usr' }),
      },
    });
    const posts = makeTable({
      name: 'posts',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'pst' }),
        authorId: primitives.ref({
          table: users,
          relation: 'author',
          inverse: 'posts',
        }),
        editorId: primitives.ref({
          table: users,
          relation: 'editor',
          inverse: 'posts',
        }),
      },
    });

    expect(() => makeDbConfig({ tables: { users, posts } })).toThrow(
      /duplicate relation name "users.posts"/,
    );
  });

  it('rejects invalid target primary-key metadata', () => {
    const users = makeTable({
      name: 'users',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'usr' }),
      },
    });
    const userId = primitives.ref({
      table: users,
      relation: 'user',
      inverse: 'posts',
    });
    Object.assign(userId, { targetColumnName: 'missingId' });
    const posts = makeTable({
      name: 'posts',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'pst' }),
        userId,
      },
    });

    expect(() => makeDbConfig({ tables: { users, posts } })).toThrow(
      /invalid target key metadata/,
    );
  });

  it('rejects a cyclic ref added to an already constructed table', () => {
    const teams = makeTable({
      name: 'teams',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'team' }),
      },
    });
    const members = makeTable({
      name: 'members',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'mbr' }),
        teamId: primitives.ref({
          table: teams,
          relation: 'team',
          inverse: 'members',
        }),
      },
    });
    Object.assign(teams.shape, {
        leadMemberId: primitives.ref({
          table: members,
          relation: 'leadMember',
          inverse: 'ledTeam',
          unique: true,
        }),
      });
    expect(() => makeDbConfig({ tables: { teams, members } })).toThrow(/cyclic ref graph/);
  });
});
