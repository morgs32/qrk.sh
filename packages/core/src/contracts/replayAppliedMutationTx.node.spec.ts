import { it } from '@effect/vitest';
import { primitives } from '@zerospin/schema';
import { eq } from 'drizzle-orm';
import { Context, Effect } from 'effect';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeProvisionedInMemorySqljsDb } from '../drizzle/makeProvisionedInMemorySqljsDb.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import type { IDbConfig, ITx } from '../drizzle/types.ts';
import { models } from '../models/index.ts';
import { makeReplica } from '../models/makeReplica.ts';

import { encodeAppliedMutation } from './encodeAppliedMutation.ts';
import { makeModelMutations } from './makeModelMutations.ts';
import { prepareReplayAppliedMutation } from './prepareReplayAppliedMutation.ts';
import { replayAppliedMutationTx } from './replayAppliedMutationTx.ts';
import type { IEncodedAppliedMutation } from './types.ts';

const appliedAt = new Date('2026-07-14T12:00:00.000Z');

describe('replayAppliedMutationTx', () => {
  it.effect('replays an exact model version and preserves provenance', () =>
    Effect.gen(function* () {
      const SourceTodo = models.makeVersion(
        models.makeModel({ name: 'todo', abbreviation: 'todo' }),
        {
          version: '1.0.0',
          attributes: { title: primitives.text() },
          indexes: [],
        },
      );
      const DestinationTodo = models.makeVersion(
        models.makeModel({ name: 'todo', abbreviation: 'todo' }),
        {
          version: '1.0.0',
          attributes: { title: primitives.text() },
          indexes: [],
        },
      );
      const sourceMutation = yield* makeModelMutations(SourceTodo).create({
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

      class Db extends Context.Service<Db, typeof db>()(
        'core/src/contracts/replayAppliedMutationTx.node.spec/Db',
      ) {
        static readonly Tx = Context.Service<
          'core/src/contracts/replayAppliedMutationTx.node.spec/Db.Tx',
          ITx<IDbConfig<IDbConfig['schema'], (typeof db)['_']['relations']>>
        >('core/src/contracts/replayAppliedMutationTx.node.spec/Db.Tx');
      }

      const replayed = yield* makeTx(
        'replayAppliedMutationTxSpec.compatible.transaction',
        Db,
      )(function* () {
        const tx = yield* Db.Tx;
        return yield* replayAppliedMutationTx({
          tx,
          mutation: encodedSource,
          controller: {
            models: { todo: DestinationTodo },
          },
        });
      })().pipe(Effect.provideService(Db, db));

      expect(replayed).toMatchObject({
        commandId: 'cmd_replaycompatible',
        mutationIndex: 7,
        modelName: 'todo',
        modelVersion: '1.0.0',
        appliedAt,
      });
      expect(
        db
          .select()
          .from(DestinationTodo.drizzleSchema)
          .where(eq(DestinationTodo.drizzleSchema.id, 'todo_replaycompatible'))
          .get(),
      ).toMatchObject({
        id: 'todo_replaycompatible',
        title: 'kept',
        version: '1.0.0',
      });
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('replays an exact replica model version', () =>
    Effect.gen(function* () {
      const SourceTodo = models.makeVersion(
        models.makeModel({ name: 'todo', abbreviation: 'todo' }),
        {
          version: '1.0.0',
          attributes: { title: primitives.text() },
          indexes: [],
        },
      );
      const SourceTodoReplica = makeReplica({
        sourceModel: SourceTodo,
        modelVersion: SourceTodo.version,
        serviceName: 'todos',
      });
      const DestinationTodo = models.makeVersion(
        models.makeModel({ name: 'todo', abbreviation: 'todo' }),
        {
          version: '1.0.0',
          attributes: { title: primitives.text() },
          indexes: [],
        },
      );
      const DestinationTodoReplica = makeReplica({
        sourceModel: DestinationTodo,
        modelVersion: DestinationTodo.version,
        serviceName: 'todos',
      });
      const sourceMutation = yield* makeModelMutations(
        SourceTodoReplica,
      ).replicate({
        id: 'todo_replaycompatible_replication',
        modelName: 'todo',
        version: '1.0.0',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-02T00:00:00.000Z'),
        title: 'Exact replication',
      });
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

      class Db extends Context.Service<Db, typeof db>()(
        'core/src/contracts/replayAppliedMutationTx.node.spec/Db',
      ) {
        static readonly Tx = Context.Service<
          'core/src/contracts/replayAppliedMutationTx.node.spec/Db.Tx',
          ITx<IDbConfig<IDbConfig['schema'], (typeof db)['_']['relations']>>
        >('core/src/contracts/replayAppliedMutationTx.node.spec/Db.Tx');
      }

      const replayed = yield* makeTx(
        'replayAppliedMutationTxSpec.compatibleReplication.transaction',
        Db,
      )(function* () {
        const tx = yield* Db.Tx;
        return yield* replayAppliedMutationTx({
          tx,
          mutation: encodedSource,
          controller: {
            models: { todo: DestinationTodoReplica },
          },
        });
      })().pipe(Effect.provideService(Db, db));

      expect(replayed).toMatchObject({
        commandId: 'cmd_replaycompatible_replication',
        mutationIndex: 8,
        modelName: 'todo',
        modelVersion: '1.0.0',
        operationName: 'replicate',
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
          version: '1.0.0',
          title: 'Exact replication',
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
        title: 'Exact replication',
        version: '1.0.0',
        deletedAt: null,
      });
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('rejects unavailable model versions and malformed operations', () =>
    Effect.gen(function* () {
      const Todo = models.makeVersion(
        models.makeModel({ name: 'todo', abbreviation: 'todo' }),
        {
          version: '1.0.0',
          attributes: { title: primitives.text() },
          indexes: [],
        },
      );
      const encoded = {
        modelName: 'todo',
        modelVersion: '1.0.0',
        resourceId: 'todo_rejected',
        operationName: 'create',
        operation: JSON.stringify({ encodedAttributes: { title: 'kept' } }),
      } satisfies Pick<
        IEncodedAppliedMutation,
        | 'modelName'
        | 'modelVersion'
        | 'resourceId'
        | 'operationName'
        | 'operation'
      >;
      for (const mutation of [
        { ...encoded, modelVersion: '2.0.0' },
        { ...encoded, modelName: 'renamedTodo' },
      ]) {
        const failure = yield* prepareReplayAppliedMutation({
          mutation,
          controller: { models: { todo: Todo } },
        }).pipe(Effect.flip);
        expect(failure.code).toBe('replay-mutation-model-version-unavailable');
      }
      const malformed = yield* prepareReplayAppliedMutation({
        mutation: { ...encoded, operation: '{' },
        controller: { models: { todo: Todo } },
      }).pipe(Effect.flip);
      expect(malformed.code).toBe(
        'replay-applied-mutation-operation-parse-failed',
      );
      const invalid = yield* prepareReplayAppliedMutation({
        mutation: {
          ...encoded,
          operation: JSON.stringify({ encodedAttributes: { title: 42 } }),
        },
        controller: { models: { todo: Todo } },
      }).pipe(Effect.flip);
      expect(invalid.code).toBe('replay-current-applied-mutation-invalid');
    }),
  );
});
