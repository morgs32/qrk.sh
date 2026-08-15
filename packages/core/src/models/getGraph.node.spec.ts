import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeMigratedInMemoryWasmSqliteDb } from '../drizzle/makeMigratedInMemoryWasmSqliteDb.ts';

import { getGraph } from './getGraph.ts';
import { makeModel } from './makeModel.ts';
import { makeSelection } from './makeSelection.ts';
import { primitives } from './primitives.ts';

const User = makeModel(
  {
    abbreviation: 'usr',
    modelName: 'user',
    attributes: {
      name: primitives.text({ nullable: true }),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const testUserId = 'usr_getgraphspec001' as const;
const otherUserId = 'usr_getgraphspec002' as const;

describe('getGraph', () => {
  it.effect('returns only resources matching user selections', () =>
    Effect.gen(function* () {
      const models = { user: User };
      const dbConfig = makeResourceDbConfig({ models });
      const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

      const now = new Date('2020-01-01T00:00:00.000Z');

      db.insert(User.drizzleSchema)
        .values({
          id: testUserId,
          modelName: User.modelName,
          createdAt: now,
          updatedAt: now,
          version: User.version,
          name: 'In scope',
        })
        .run();

      db.insert(User.drizzleSchema)
        .values({
          id: otherUserId,
          modelName: User.modelName,
          createdAt: now,
          updatedAt: now,
          version: User.version,
          name: 'Other user',
        })
        .run();

      const selections = {
        user: makeSelection({
          model: User,
          where: ({ userId }) => ({ id: userId }),
        }),
      };

      const graph = getGraph({
        db,
        userId: testUserId,
        models,
        selections,
      });

      expect(Object.keys(graph)).toEqual([testUserId]);
      expect(graph[testUserId]?.name).toBe('In scope');
    }).pipe(Effect.provide(AsyncLive)),
  );
});
