import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { List, mainModels, User } from '../fixtures/system.ts';
import { makeTable } from '../models/makeTable.ts';
import { primitives } from '../models/primitives.ts';
import { sessionRepoTables } from '../session/sessionRepoTables.ts';

import { makeDbConfig, makeResourceDbConfig } from './makeDbConfig.ts';
import { makeMigratedInMemoryWasmSqliteDb } from './makeMigratedInMemoryWasmSqliteDb.ts';

describe('makeResourceDbConfig', () => {
  it('queries model refs in both forward and inverse directions', async () => {
    const db = await Effect.runPromise(
      makeMigratedInMemoryWasmSqliteDb({
        dbConfig: makeResourceDbConfig({ models: mainModels }),
      }).pipe(Effect.provide(AsyncLive)),
    );

    try {
      const now = new Date('2026-07-13T00:00:00.000Z');
      db.insert(User.drizzleSchema)
        .values({
          id: 'usr_relation',
          modelName: User.modelName,
          createdAt: now,
          updatedAt: now,
          version: User.version,
          actorId: 'actr_relation',
          name: 'Relation user',
        })
        .run();
      db.insert(List.drizzleSchema)
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
      expect(storedUser?.lists.map(list => list.id)).toEqual([
        'lst_relation',
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
      makeMigratedInMemoryWasmSqliteDb({ dbConfig }).pipe(
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
      makeMigratedInMemoryWasmSqliteDb({ dbConfig }).pipe(
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
          with: { childCategories: true },
        })
        .sync();

      expect(storedChild?.parentCategory?.id).toBe('cat_root');
      expect(storedRoot?.childCategories.map(category => category.id)).toEqual([
        'cat_child',
      ]);
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
      makeMigratedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );

    try {
      expect(typeof db.query.stagedCommands!.findMany).toBe('function');
      expect(db.query.stagedCommands!.findMany().sync()).toEqual([]);
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
      /duplicate table name "records"/,
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

  it('rejects erased cyclic table graphs', () => {
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

    expect(() => makeDbConfig({ tables: { teams, members } })).toThrow(
      /cyclic ref graph/,
    );
  });
});
