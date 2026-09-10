import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { primitives } from '@zerospin/schema';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeProvisionedInMemoryWasmSqliteDb } from '../drizzle/makeProvisionedInMemoryWasmSqliteDb.ts';

import { getGraph } from './getGraph.ts';
import { makeSelection } from './makeSelection.ts';

import { models as modelDefinitions } from './index.ts';

const User = modelDefinitions.makeVersion(
  modelDefinitions.makeModel({ name: 'user', abbreviation: 'usr' }),
  {
    attributes: {
      name: primitives.text({ nullable: true }),
    },
    indexes: [],
    version: '1.0.0',
  },
);

const testUserId = 'usr_getgraphspec001' as const;
const otherUserId = 'usr_getgraphspec002' as const;

describe('getGraph', () => {
  it.effect('returns only resources matching user selections', () =>
    Effect.gen(function* () {
      const models = { user: User };
      const dbConfig = makeResourceDbConfig({ models });
      const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });

      const now = new Date('2020-01-01T00:00:00.000Z');

      db.insert(dbConfig.schema.user)
        .values({
          id: testUserId,
          modelName: User.modelName,
          createdAt: now,
          updatedAt: now,
          version: User.version,
          name: 'In scope',
        })
        .run();

      db.insert(dbConfig.schema.user)
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
