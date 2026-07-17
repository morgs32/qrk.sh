import { it } from '@effect/vitest';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeMigratedInMemorySqljsDb } from '../drizzle/makeMigratedInMemorySqljsDb.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import { mainModels, User } from '../fixtures/system.ts';

import { applyMutationTx } from './applyMutationTx.ts';
import { commitAppliedMutationTx } from './commitAppliedMutationTx.ts';
import { decodeAppliedMutation } from './decodeAppliedMutation.ts';
import { encodeAppliedMutation } from './encodeAppliedMutation.ts';

const testUserId = 'usr_commitdel001' as const;
const testActorId = 'actr_commitdel001' as const;
const now = new Date('2020-01-01T00:00:00.000Z');
const appliedAt = new Date('2020-01-02T00:00:00.000Z');

const userRow = {
  id: testUserId,
  modelName: User.modelName,
  createdAt: now,
  updatedAt: now,
  version: User.version,
  actorId: testActorId,
  name: 'Alice',
};

describe('commitAppliedMutationTx delete', () => {
  it.effect('encoded delete round-trips and removes the replica row', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const authorDb = yield* makeMigratedInMemorySqljsDb({ dbConfig });
      const replicaDb = yield* makeMigratedInMemorySqljsDb({ dbConfig });
      authorDb.insert(User.drizzleSchema).values(userRow).run();
      replicaDb.insert(User.drizzleSchema).values(userRow).run();

      const mutation = yield* User.delete('1.0.0', {
        resourceId: testUserId,
      });
      const applied = yield* makeTx({
        db: authorDb,
        program: Effect.fn('commitDeleteSpec.apply.transaction')(function* ({
          tx,
        }) {
          return yield* applyMutationTx({
            tx,
            mutation,
            commandId: 'cmd_commitdel001',
            mutationIndex: 0,
            appliedAt,
          });
        }),
      });

      const encoded = yield* encodeAppliedMutation({ mutation: applied });
      expect(encoded.operationName).toBe('delete');
      expect(encoded.operation).toBe('{}');

      const decoded = yield* decodeAppliedMutation({
        mutation: encoded,
        model: User,
      });
      expect(decoded.operationName).toBe('delete');
      expect(decoded.inverseOperation).toEqual({
        resource: expect.objectContaining({
          id: testUserId,
          name: 'Alice',
        }),
      });

      const committed = yield* makeTx({
        db: replicaDb,
        program: Effect.fn('commitDeleteSpec.commit.transaction')(function* ({
          tx,
        }) {
          return yield* commitAppliedMutationTx({
            tx,
            models: mainModels,
            mutation: encoded,
          });
        }),
      });
      expect(committed).toBeNull();

      const replicaRow = replicaDb
        .select()
        .from(User.drizzleSchema)
        .where(eq(User.drizzleSchema.id, testUserId))
        .get();
      expect(replicaRow).toBeUndefined();

      const replayed = yield* makeTx({
        db: replicaDb,
        program: Effect.fn('commitDeleteSpec.replay.transaction')(function* ({
          tx,
        }) {
          return yield* commitAppliedMutationTx({
            tx,
            models: mainModels,
            mutation: encoded,
          });
        }),
      });
      expect(replayed).toBeNull();
    }).pipe(Effect.provide(AsyncLive)),
  );
});
