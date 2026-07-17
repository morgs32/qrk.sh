import { it } from '@effect/vitest';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeMigratedInMemorySqljsDb } from '../drizzle/makeMigratedInMemorySqljsDb.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import { makeModel } from '../models/makeModel.ts';
import { primitives } from '../models/primitives.ts';

import { encodeAppliedMutation } from './encodeAppliedMutation.ts';
import { replayAppliedMutationTx } from './replayAppliedMutationTx.ts';

const appliedAt = new Date('2026-07-14T12:00:00.000Z');

describe('replayAppliedMutationTx', () => {
  it.effect(
    'automatically promotes a compatible historical mutation and preserves provenance',
    () =>
      Effect.gen(function* () {
        const SourceTodo = makeModel(
          {
            modelName: 'todo',
            abbreviation: 'todo',
            version: '1.0.0',
            attributes: { title: primitives.text() },
            indexes: [],
          },
          [],
        );
        const DestinationTodo = makeModel(
          {
            modelName: 'todo',
            abbreviation: 'todo',
            version: '1.1.0',
            attributes: { title: primitives.text() },
            indexes: [],
          },
          [
            {
              modelName: 'todo',
              abbreviation: 'todo',
              version: '1.0.0',
              attributes: { title: primitives.text() },
              indexes: [],
            },
          ],
        );
        const sourceMutation = yield* SourceTodo.create('1.0.0', {
          resourceId: 'todo_replaycompatible',
          attributes: { title: 'kept' },
        });
        const encodedSource = yield* encodeAppliedMutation({
          mutation: {
            ...sourceMutation,
            commandId: 'cmd_replaycompatible',
            mutationIndex: 7,
            appliedAt,
            lastAppliedAt: null,
            inverseOperation: null,
          },
        });
        const db = yield* makeMigratedInMemorySqljsDb({
          dbConfig: makeResourceDbConfig({
            models: { todo: DestinationTodo },
          }),
        });

        const replayed = yield* makeTx({
          db,
          program: Effect.fn(
            'replayAppliedMutationTxSpec.compatible.transaction',
          )(function* ({ tx }) {
            return yield* replayAppliedMutationTx({
              tx,
              mutation: encodedSource,
              controller: {
                models: { todo: DestinationTodo },
                mutationAdapters: undefined,
              },
            });
          }),
        });

        expect(replayed).toMatchObject({
          commandId: 'cmd_replaycompatible',
          mutationIndex: 7,
          modelName: 'todo',
          modelVersion: '1.1.0',
          appliedAt,
        });
        expect(
          db
            .select()
            .from(DestinationTodo.drizzleSchema)
            .where(
              eq(
                DestinationTodo.drizzleSchema.id,
                'todo_replaycompatible',
              ),
            )
            .get(),
        ).toMatchObject({
          id: 'todo_replaycompatible',
          title: 'kept',
          version: '1.1.0',
        });
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'uses one direct historical adapter, validates its destination, and recomputes inverse state',
    () =>
      Effect.gen(function* () {
        const SourceTodo = makeModel(
          {
            modelName: 'todo',
            abbreviation: 'todo',
            version: '1.0.0',
            attributes: { title: primitives.text() },
            indexes: [],
          },
          [],
        );
        const DestinationTodo = makeModel(
          {
            modelName: 'todo',
            abbreviation: 'todo',
            version: '2.0.0',
            attributes: {
              label: primitives.text(),
              completed: primitives.boolean(),
            },
            indexes: [],
          },
          [
            {
              modelName: 'todo',
              abbreviation: 'todo',
              version: '1.0.0',
              attributes: { title: primitives.text() },
              indexes: [],
            },
          ],
        );
        const sourceMutation = yield* SourceTodo.update('1.0.0', {
          resourceId: 'todo_replayadapted',
          attributes: { title: 'after' },
        });
        const encodedSource = yield* encodeAppliedMutation({
          mutation: {
            ...sourceMutation,
            commandId: 'cmd_replayadapted',
            mutationIndex: 3,
            appliedAt,
            lastAppliedAt: new Date('2000-01-01T00:00:00.000Z'),
            inverseOperation: { attributes: { title: 'source inverse' } },
          },
        });
        const db = yield* makeMigratedInMemorySqljsDb({
          dbConfig: makeResourceDbConfig({
            models: { todo: DestinationTodo },
          }),
        });
        const targetPreviousUpdatedAt = new Date(
          '2026-07-01T00:00:00.000Z',
        );
        db.insert(DestinationTodo.drizzleSchema)
          .values({
            id: 'todo_replayadapted',
            modelName: 'todo',
            version: '2.0.0',
            createdAt: targetPreviousUpdatedAt,
            updatedAt: targetPreviousUpdatedAt,
            label: 'target before',
            completed: false,
          })
          .run();

        const replayed = yield* makeTx({
          db,
          program: Effect.fn(
            'replayAppliedMutationTxSpec.adapter.transaction',
          )(function* ({ tx }) {
            return yield* replayAppliedMutationTx({
              tx,
              mutation: encodedSource,
              controller: {
                models: { todo: DestinationTodo },
                mutationAdapters: {
                  todo: {
                    update: [
                      {
                        source: DestinationTodo.updateMutation('1.0.0'),
                        destination:
                          DestinationTodo.updateMutation('2.0.0'),
                        adapter: mutation =>
                          DestinationTodo.update('2.0.0', {
                            resourceId: mutation.resourceId,
                            attributes: {
                              label: mutation.operation.attributes.title,
                              completed: true,
                            },
                          }),
                      },
                    ],
                  },
                },
              },
            });
          }),
        });

        expect(replayed).toMatchObject({
          modelVersion: '2.0.0',
          commandId: 'cmd_replayadapted',
          mutationIndex: 3,
          appliedAt,
          lastAppliedAt: targetPreviousUpdatedAt,
        });
        expect(replayed?.inverseOperation).toContain('target before');
        expect(replayed?.inverseOperation).not.toContain('source inverse');
        expect(
          db
            .select()
            .from(DestinationTodo.drizzleSchema)
            .where(eq(DestinationTodo.drizzleSchema.id, 'todo_replayadapted'))
            .get(),
        ).toMatchObject({
          label: 'after',
          completed: true,
          updatedAt: appliedAt,
        });
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('supports renamed destinations and null discard edges', () =>
    Effect.gen(function* () {
      const SourceTodo = makeModel(
        {
          modelName: 'todo',
          abbreviation: 'todo',
          version: '1.0.0',
          attributes: { title: primitives.text() },
          indexes: [],
        },
        [],
      );
      const DestinationTask = makeModel(
        {
          modelName: 'task',
          abbreviation: 'task',
          version: '2.0.0',
          attributes: { label: primitives.text() },
          indexes: [],
        },
        [],
      );
      const sourceMutation = yield* SourceTodo.create('1.0.0', {
        resourceId: 'todo_replayrenamed',
        attributes: { title: 'renamed' },
      });
      const encodedSource = yield* encodeAppliedMutation({
        mutation: {
          ...sourceMutation,
          commandId: 'cmd_replayrenamed',
          mutationIndex: 0,
          appliedAt,
          lastAppliedAt: null,
          inverseOperation: null,
        },
      });
      const db = yield* makeMigratedInMemorySqljsDb({
        dbConfig: makeResourceDbConfig({
          models: { task: DestinationTask },
        }),
      });

      const renamed = yield* makeTx({
        db,
        program: Effect.fn('replayAppliedMutationTxSpec.rename.transaction')(
          function* ({ tx }) {
            return yield* replayAppliedMutationTx({
              tx,
              mutation: encodedSource,
              controller: {
                models: { task: DestinationTask },
                mutationAdapters: {
                  todo: {
                    create: [
                      {
                        source: SourceTodo.createMutation('1.0.0'),
                        destination:
                          DestinationTask.createMutation('2.0.0'),
                        adapter: mutation =>
                          DestinationTask.create('2.0.0', {
                            resourceId: 'task_replayrenamed',
                            attributes: {
                              label: mutation.operation.attributes.title,
                            },
                          }),
                      },
                    ],
                  },
                },
              },
            });
          },
        ),
      });
      expect(renamed).toMatchObject({
        modelName: 'task',
        modelVersion: '2.0.0',
        resourceId: 'task_replayrenamed',
      });

      const discarded = yield* makeTx({
        db,
        program: Effect.fn('replayAppliedMutationTxSpec.discard.transaction')(
          function* ({ tx }) {
            return yield* replayAppliedMutationTx({
              tx,
              mutation: {
                ...encodedSource,
                commandId: 'cmd_replaydiscarded',
              },
              controller: {
                models: { task: DestinationTask },
                mutationAdapters: {
                  todo: {
                    create: [
                      {
                        source: SourceTodo.createMutation('1.0.0'),
                        destination: null,
                      },
                    ],
                  },
                },
              },
            });
          },
        ),
      });
      expect(discarded).toBeNull();
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('fails closed for missing and invalid direct adapters', () =>
    Effect.gen(function* () {
      const SourceTodo = makeModel(
        {
          modelName: 'todo',
          abbreviation: 'todo',
          version: '1.0.0',
          attributes: { title: primitives.text() },
          indexes: [],
        },
        [],
      );
      const DestinationTodo = makeModel(
        {
          modelName: 'todo',
          abbreviation: 'todo',
          version: '2.0.0',
          attributes: {
            title: primitives.text(),
            completed: primitives.boolean(),
          },
          indexes: [],
        },
        [
          {
            modelName: 'todo',
            abbreviation: 'todo',
            version: '1.0.0',
            attributes: { title: primitives.text() },
            indexes: [],
          },
        ],
      );
      const sourceMutation = yield* SourceTodo.create('1.0.0', {
        resourceId: 'todo_replayfailure',
        attributes: { title: 'failure' },
      });
      const encodedSource = yield* encodeAppliedMutation({
        mutation: {
          ...sourceMutation,
          commandId: 'cmd_replayfailure',
          mutationIndex: 0,
          appliedAt,
          lastAppliedAt: null,
          inverseOperation: null,
        },
      });
      const db = yield* makeMigratedInMemorySqljsDb({
        dbConfig: makeResourceDbConfig({
          models: { todo: DestinationTodo },
        }),
      });

      const missing = yield* makeTx({
        db,
        program: Effect.fn('replayAppliedMutationTxSpec.missing.transaction')(
          function* ({ tx }) {
            return yield* replayAppliedMutationTx({
              tx,
              mutation: encodedSource,
              controller: {
                models: { todo: DestinationTodo },
                mutationAdapters: undefined,
              },
            }).pipe(Effect.either);
          },
        ),
      });
      expect(missing._tag).toBe('Left');
      if (missing._tag === 'Left') {
        expect(missing.left.code).toBe('replay-mutation-adapter-missing');
      }

      const invalid = yield* makeTx({
        db,
        program: Effect.fn('replayAppliedMutationTxSpec.invalid.transaction')(
          function* ({ tx }) {
            return yield* replayAppliedMutationTx({
              tx,
              mutation: encodedSource,
              controller: {
                models: { todo: DestinationTodo },
                mutationAdapters: {
                  todo: {
                    create: [
                      {
                        source: Schema.String,
                        destination:
                          DestinationTodo.createMutation('2.0.0'),
                        adapter: () => Effect.succeed({}),
                      },
                    ],
                  },
                },
              },
            }).pipe(Effect.either);
          },
        ),
      });
      expect(invalid._tag).toBe('Left');
      if (invalid._tag === 'Left') {
        expect(invalid.left.code).toBe(
          'replay-mutation-adapter-source-identity-invalid',
        );
      }
    }).pipe(Effect.provide(AsyncLive)),
  );
});
