import { it } from '@effect/vitest';
import { primitives } from '@zerospin/schema';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeProvisionedInMemorySqljsDb } from '../drizzle/makeProvisionedInMemorySqljsDb.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import { makeModel } from '../models/makeModel.ts';
import { makeReplica } from '../models/makeReplica.ts';

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
              adaptResource: ({ resource }) =>
                Effect.succeed({
                  id: resource.id,
                  modelName: resource.modelName,
                  createdAt: resource.createdAt,
                  updatedAt: resource.updatedAt,
                  version: '1.0.0',
                  title: resource.title,
                }),
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
        const dbConfig = makeResourceDbConfig({
          models: { todo: DestinationTodo },
        });
        const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });

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
              eq(DestinationTodo.drizzleSchema.id, 'todo_replaycompatible'),
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
    'automatically promotes compatible historical replication without an adapter',
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
        const SourceTodoReplica = makeReplica({
          sourceModel: SourceTodo,
          serviceName: 'todos',
        });
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
              adaptResource: ({ resource }) =>
                Effect.succeed({
                  id: resource.id,
                  modelName: resource.modelName,
                  createdAt: resource.createdAt,
                  updatedAt: resource.updatedAt,
                  version: '1.0.0',
                  title: resource.title,
                }),
            },
          ],
        );
        const DestinationTodoReplica = makeReplica({
          sourceModel: DestinationTodo,
          serviceName: 'todos',
        });
        const sourceMutation = yield* SourceTodoReplica.replicateResource(
          '1.0.0',
          {
            resource: {
              id: 'todo_replaycompatible_replication',
              modelName: 'todo',
              version: '1.0.0',
              createdAt: new Date('2026-07-01T00:00:00.000Z'),
              updatedAt: new Date('2026-07-02T00:00:00.000Z'),
              title: 'Compatible historical replication',
            },
          },
        );
        const encodedSource = yield* encodeAppliedMutation({
          mutation: {
            ...sourceMutation,
            commandId: 'cmd_replaycompatible_replication',
            mutationIndex: 8,
            appliedAt,
            lastAppliedAt: null,
            inverseOperation: null,
          },
        });
        const db = yield* makeProvisionedInMemorySqljsDb({
          dbConfig: makeResourceDbConfig({
            models: { todo: DestinationTodoReplica },
          }),
        });

        const replayed = yield* makeTx({
          db,
          program: Effect.fn(
            'replayAppliedMutationTxSpec.compatibleReplication.transaction',
          )(function* ({ tx }) {
            return yield* replayAppliedMutationTx({
              tx,
              mutation: encodedSource,
              controller: {
                models: { todo: DestinationTodoReplica },
                mutationAdapters: undefined,
              },
            });
          }),
        });

        expect(replayed).toMatchObject({
          commandId: 'cmd_replaycompatible_replication',
          mutationIndex: 8,
          modelName: 'todo',
          modelVersion: '1.1.0',
          operationName: 'replicateResource',
          resourceId: 'todo_replaycompatible_replication',
        });
        if (replayed === null) {
          throw new Error('expected replayed compatible replication mutation');
        }
        expect(JSON.parse(replayed.operation)).toMatchObject({
          serviceName: 'todos',
          resource: {
            id: 'todo_replaycompatible_replication',
            modelName: 'todo',
            version: '1.1.0',
            title: 'Compatible historical replication',
            deletedAt: null,
          },
        });
        expect(
          db
            .select()
            .from(DestinationTodoReplica.drizzleSchema)
            .where(
              eq(
                DestinationTodoReplica.drizzleSchema.id,
                'todo_replaycompatible_replication',
              ),
            )
            .get(),
        ).toMatchObject({
          id: 'todo_replaycompatible_replication',
          title: 'Compatible historical replication',
          version: '1.1.0',
          deletedAt: null,
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
              adaptResource: ({ resource }) =>
                Effect.succeed({
                  id: resource.id,
                  modelName: resource.modelName,
                  createdAt: resource.createdAt,
                  updatedAt: resource.updatedAt,
                  version: '1.0.0',
                  title: resource.label,
                }),
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
        const dbConfig = makeResourceDbConfig({
          models: { todo: DestinationTodo },
        });
        const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });
        const targetPreviousUpdatedAt = new Date('2026-07-01T00:00:00.000Z');
        db.insert(dbConfig.schema.todo)
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

        const sourceAdapterSchema = DestinationTodo.updateMutation('1.0.0');
        const replayed = yield* makeTx({
          db,
          program: Effect.fn('replayAppliedMutationTxSpec.adapter.transaction')(
            function* ({ tx }) {
              return yield* replayAppliedMutationTx({
                tx,
                mutation: encodedSource,
                controller: {
                  models: { todo: DestinationTodo },
                  mutationAdapters: {
                    todo: {
                      update: [
                        {
                          source: sourceAdapterSchema,
                          destination: DestinationTodo.updateMutation('2.0.0'),
                          adapter: (
                            mutation: Readonly<{
                              resourceId: `todo_${string}`;
                              operation: Readonly<{
                                attributes: Readonly<{ title: string }>;
                              }>;
                            }>,
                          ) =>
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
            },
          ),
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
      const db = yield* makeProvisionedInMemorySqljsDb({
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
                        destination: DestinationTask.createMutation('2.0.0'),
                        adapter: (mutation: typeof sourceMutation) =>
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

  it.effect(
    'replays historical nested replication through a renamed exact replica binding',
    () =>
      Effect.gen(function* () {
        const SourceProduct = makeModel(
          {
            modelName: 'product',
            abbreviation: 'prd',
            version: '1.0.0',
            attributes: { title: primitives.text() },
            indexes: [],
          },
          [],
        );
        const SourceProductReplica = makeReplica({
          sourceModel: SourceProduct,
          serviceName: 'catalog',
        });
        const DestinationCatalogItem = makeModel(
          {
            modelName: 'catalogItem',
            abbreviation: 'prd',
            version: '2.0.0',
            attributes: {
              label: primitives.text(),
              available: primitives.boolean(),
            },
            indexes: [],
          },
          [
            {
              modelName: 'catalogItem',
              abbreviation: 'prd',
              version: '1.0.0',
              attributes: { label: primitives.text() },
              indexes: [],
              adaptResource: ({ resource }) =>
                Effect.succeed({
                  id: resource.id,
                  modelName: resource.modelName,
                  createdAt: resource.createdAt,
                  updatedAt: resource.updatedAt,
                  version: '1.0.0',
                  label: resource.label,
                }),
            },
          ],
        );
        const DestinationCatalogItemReplica = makeReplica({
          sourceModel: DestinationCatalogItem,
          serviceName: 'catalog',
        });
        const UnrelatedProduct = makeModel(
          {
            modelName: 'product',
            abbreviation: 'uprd',
            version: '9.0.0',
            attributes: { title: primitives.text() },
            indexes: [],
          },
          [],
        );
        const sourceMutation = yield* SourceProductReplica.replicateResource(
          '1.0.0',
          {
            resource: {
              id: 'prd_replayreplicated',
              modelName: 'product',
              version: '1.0.0',
              createdAt: new Date('2026-07-01T00:00:00.000Z'),
              updatedAt: new Date('2026-07-02T00:00:00.000Z'),
              title: 'Historical source title',
            },
          },
        );
        const encodedSource = yield* encodeAppliedMutation({
          mutation: {
            ...sourceMutation,
            commandId: 'cmd_replayreplicated',
            mutationIndex: 4,
            appliedAt,
            lastAppliedAt: null,
            inverseOperation: null,
          },
        });
        const db = yield* makeProvisionedInMemorySqljsDb({
          dbConfig: makeResourceDbConfig({
            models: {
              catalogItem: DestinationCatalogItemReplica,
              product: UnrelatedProduct,
            },
          }),
        });

        const replayed = yield* makeTx({
          db,
          program: Effect.fn(
            'replayAppliedMutationTxSpec.replicationRename.transaction',
          )(function* ({ tx }) {
            return yield* replayAppliedMutationTx({
              tx,
              mutation: encodedSource,
              controller: {
                models: {
                  catalogItem: DestinationCatalogItemReplica,
                  product: UnrelatedProduct,
                },
                mutationAdapters: {
                  product: {
                    replicateResource: [
                      {
                        source:
                          SourceProductReplica.replicateResourceMutation(
                            '1.0.0',
                          ),
                        destination:
                          DestinationCatalogItemReplica.replicateResourceMutation(
                            '2.0.0',
                          ),
                        adapter: (mutation: typeof sourceMutation) =>
                          DestinationCatalogItemReplica.replicateResource(
                            '2.0.0',
                            {
                              resource: {
                                id: mutation.resourceId,
                                modelName: 'catalogItem',
                                version: '2.0.0',
                                createdAt:
                                  mutation.operation.resource.createdAt,
                                updatedAt:
                                  mutation.operation.resource.updatedAt,
                                label: mutation.operation.resource.title,
                                available: true,
                              },
                            },
                          ),
                      },
                    ],
                  },
                },
              },
            });
          }),
        });

        expect(replayed).toMatchObject({
          commandId: 'cmd_replayreplicated',
          mutationIndex: 4,
          modelName: 'catalogItem',
          modelVersion: '2.0.0',
          operationName: 'replicateResource',
          resourceId: 'prd_replayreplicated',
        });
        if (replayed === null) {
          throw new Error('expected replayed replication mutation');
        }
        expect(JSON.parse(replayed.operation)).toMatchObject({
          serviceName: 'catalog',
          resource: {
            id: 'prd_replayreplicated',
            modelName: 'catalogItem',
            version: '2.0.0',
            label: 'Historical source title',
            available: true,
            deletedAt: null,
          },
        });
        expect(
          db
            .select()
            .from(DestinationCatalogItemReplica.drizzleSchema)
            .where(
              eq(
                DestinationCatalogItemReplica.drizzleSchema.id,
                'prd_replayreplicated',
              ),
            )
            .get(),
        ).toMatchObject({
          id: 'prd_replayreplicated',
          modelName: 'catalogItem',
          version: '2.0.0',
          label: 'Historical source title',
          available: true,
          deletedAt: null,
        });
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
            adaptResource: ({ resource }) =>
              Effect.succeed({
                id: resource.id,
                modelName: resource.modelName,
                createdAt: resource.createdAt,
                updatedAt: resource.updatedAt,
                version: '1.0.0',
                title: resource.title,
              }),
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
      const db = yield* makeProvisionedInMemorySqljsDb({
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
            }).pipe(Effect.result);
          },
        ),
      });
      expect(missing._tag).toBe('Failure');
      if (missing._tag === 'Failure') {
        expect(missing.failure.code).toBe('replay-mutation-adapter-missing');
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
                        // @ts-expect-error runtime validation rejects a non-mutation source schema
                        source: Schema.String,
                        destination: DestinationTodo.createMutation('2.0.0'),
                        adapter: () => Effect.succeed({}),
                      },
                    ],
                  },
                },
              },
            }).pipe(Effect.result);
          },
        ),
      });
      expect(invalid._tag).toBe('Failure');
      if (invalid._tag === 'Failure') {
        expect(invalid.failure.code).toBe(
          'replay-mutation-adapter-source-identity-invalid',
        );
      }
    }).pipe(Effect.provide(AsyncLive)),
  );
});
