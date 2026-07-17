/*
 * System-worker annotation:
 * Exercises the deltas.node.spec behavior through the local test/runtime harness.
 * The assertions document expected integration behavior; avoid broad rewrites while changing production code.
 */

import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemorySqljsDb } from '@zerospin/core/drizzle/makeMigratedInMemorySqljsDb';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { mainModels } from '../fixtures/system.js';

import { getDeletedRefs } from './getDeletedRefs.js';
import { getInsertedResources } from './getInsertedResources.js';
import { getUpdatedResources } from './getUpdatedResources.js';
import { isDeltaEmpty } from './isDeltaEmpty.js';

const now = new Date('2026-01-01T00:00:00.000Z');
const appliedAt = new Date('2026-01-02T00:00:00.000Z');

describe('getInsertedResources', () => {
  it('keeps destination selected resources that were absent from origin refs', () => {
    const usrExisting = { id: 'usr_existing', modelName: 'user' };
    const usrAdded = { id: 'usr_added', modelName: 'user', name: 'Added' };
    const usrRemoved = { id: 'usr_removed', modelName: 'user' };

    const inserted = getInsertedResources({
      originSelectedRefs: {
        usr_existing: usrExisting,
        usr_removed: usrRemoved,
      },
      destinationSelectedResources: {
        usr_existing: { ...usrExisting, name: 'Existing' },
        usr_added: usrAdded,
      },
    });

    expect(inserted).toEqual({
      usr_added: usrAdded,
    });
  });
});

describe('getDeletedRefs', () => {
  it('keeps origin selected refs that are absent from destination resources', () => {
    const usrExisting = { id: 'usr_existing', modelName: 'user' };
    const usrAdded = { id: 'usr_added', modelName: 'user', name: 'Added' };
    const usrRemoved = { id: 'usr_removed', modelName: 'user' };

    const deleted = getDeletedRefs({
      originSelectedRefs: {
        usr_existing: usrExisting,
        usr_removed: usrRemoved,
      },
      destinationSelectedResources: {
        usr_existing: { ...usrExisting, name: 'Existing' },
        usr_added: usrAdded,
      },
    });

    expect(deleted).toEqual({
      usr_removed: usrRemoved,
    });
  });
});

describe('getUpdatedResources', () => {
  it.effect(
    'returns committed in-graph resources and skips out-of-graph mutations',
    () =>
      Effect.gen(function* () {
        const models = mainModels;
        const dbConfig = makeResourceDbConfig({ models });
        const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });

        db.insert(models.user.drizzleSchema)
          .values({
            id: 'usr_in_graph',
            modelName: models.user.modelName,
            createdAt: now,
            updatedAt: now,
            version: models.user.version,
            actorId: 'actr_1',
            name: 'Before',
          })
          .run();
        db.insert(models.user.drizzleSchema)
          .values({
            id: 'usr_outside_graph',
            modelName: models.user.modelName,
            createdAt: now,
            updatedAt: now,
            version: models.user.version,
            actorId: 'actr_1',
            name: 'Outside',
          })
          .run();

        const updated = yield* makeTx({
          db,
          program: Effect.fn('deltas.getUpdatedResources.transaction')(
            function* ({ tx }) {
              return yield* getUpdatedResources({
                tx,
                frontendModels: models,
                graph: {
                  usr_in_graph: {
                    id: 'usr_in_graph',
                    modelName: models.user.modelName,
                  },
                },
                appliedMutations: [
                  {
                    commandId: 'cmd_in_graph',
                    mutationIndex: 0,
                    modelName: models.user.modelName,
                    resourceId: 'usr_in_graph',
                    operationName: 'update',
                    operation: JSON.stringify({
                      encodedAttributes: { name: 'After' },
                    }),
                    appliedAt,
                    lastAppliedAt: null,
                    inverseOperation: JSON.stringify(null),
                  },
                  {
                    commandId: 'cmd_outside_graph',
                    mutationIndex: 1,
                    modelName: models.user.modelName,
                    resourceId: 'usr_outside_graph',
                    operationName: 'update',
                    operation: JSON.stringify({
                      encodedAttributes: { name: 'Skipped' },
                    }),
                    appliedAt,
                    lastAppliedAt: null,
                    inverseOperation: JSON.stringify(null),
                  },
                  {
                    commandId: 'cmd_outside_frontend',
                    mutationIndex: 2,
                    modelName: 'product',
                    resourceId: 'prd_outside_frontend',
                    operationName: 'update',
                    operation: JSON.stringify({
                      encodedAttributes: { name: 'Skipped' },
                    }),
                    appliedAt,
                    lastAppliedAt: null,
                    inverseOperation: JSON.stringify(null),
                  },
                ],
              });
            },
          ),
        });

        const outsideRow = db
          .select()
          .from(models.user.drizzleSchema)
          .where(eq(models.user.drizzleSchema.id, 'usr_outside_graph'))
          .get();

        expect(updated).toEqual([
          expect.objectContaining({
            id: 'usr_in_graph',
            name: 'After',
          }),
        ]);
        expect(outsideRow?.name).toBe('Outside');
      }).pipe(Effect.provide(AsyncLive)),
  );
});

describe('isDeltaEmpty', () => {
  it('is true only when all fields empty', () => {
    expect(isDeltaEmpty({ inserted: [], updated: [], deleted: [] })).toBe(true);
    expect(
      isDeltaEmpty({
        inserted: [],
        updated: [
          {
            id: 'usr_1',
            modelName: 'user',
            name: 'Changed',
          },
        ],
        deleted: [],
      }),
    ).toBe(false);
  });
});
