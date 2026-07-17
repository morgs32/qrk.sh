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
      actorId: primitives.opaqueId({ abbreviation: 'actr', unique: true }),
      name: primitives.text({ nullable: true }),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const testActorId = 'actr_getgraphspec01' as const;
const otherActorId = 'actr_getgraphspec02' as const;
const inScopeUserId = 'usr_getgraphspec001' as const;
const outOfScopeUserId = 'usr_getgraphspec002' as const;

describe('getGraph', () => {
  it.effect('returns only resources matching actor selections', () =>
    Effect.gen(function* () {
      const models = { user: User };
      const dbConfig = makeResourceDbConfig({ models });
      const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

      const now = new Date('2020-01-01T00:00:00.000Z');

      db.insert(User.drizzleSchema)
        .values({
          id: inScopeUserId,
          modelName: User.modelName,
          createdAt: now,
          updatedAt: now,
          version: User.version,
          actorId: testActorId,
          name: 'In scope',
        })
        .run();

      db.insert(User.drizzleSchema)
        .values({
          id: outOfScopeUserId,
          modelName: User.modelName,
          createdAt: now,
          updatedAt: now,
          version: User.version,
          actorId: otherActorId,
          name: 'Other actor',
        })
        .run();

      const selections = {
        user: makeSelection({
          model: User,
          where: ({ actorId }) => ({ actorId }),
        }),
      };

      const graph = getGraph({
        db,
        actorId: testActorId,
        models,
        selections,
      });

      expect(Object.keys(graph)).toEqual([inScopeUserId]);
      expect(graph[inScopeUserId]?.name).toBe('In scope');
    }).pipe(Effect.provide(AsyncLive)),
  );
});
