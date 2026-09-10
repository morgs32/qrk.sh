import { describe, expect, it } from '@effect/vitest';
import { primitives } from '@zerospin/schema';
import { eq } from 'drizzle-orm';
import { Context, Effect, Schema } from 'effect';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeProvisionedInMemorySqljsDb } from '../drizzle/makeProvisionedInMemorySqljsDb.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import type { IDbConfig, ITx } from '../drizzle/types.ts';
import { models } from '../models/index.ts';
import { makeReplica } from '../models/makeReplica.ts';
import type { IModelReplica } from '../models/types.ts';

import { applyAggregateFrontendMutationTx } from './applyAggregateFrontendMutationTx.ts';
import { applyMutationInverseTx } from './applyMutationInverseTx.ts';
import { decodeAppliedMutation } from './decodeAppliedMutation.ts';
import { encodeAppliedMutation } from './encodeAppliedMutation.ts';
import { makeModelMutations } from './makeModelMutations.ts';

const SourceUser = models.makeVersion(
  models.makeModel({ name: 'user', abbreviation: 'usr' }),
  {
    attributes: {
      userId: primitives.foreignKey({ abbreviation: 'uid', unique: true }),
      name: primitives.text({ nullable: true }),
    },
    indexes: [],
    version: '1.0.0',
  },
);
const User = makeReplica({
  sourceModel: SourceUser,
  modelVersion: SourceUser.version,
  serviceName: 'directory',
});
const dbConfig = makeResourceDbConfig({ models: { user: User } });

const resource = {
  id: 'usr_replicated' as const,
  modelName: User.modelName,
  version: User.version,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  userId: 'uid_replicated' as const,
  name: 'Replicated user',
};
const replicaResource = { ...resource, deletedAt: null, serviceIndex: null };

describe('replicate', () => {
  it('rejects a different version of the exact replica', () => {
    const erasedUser: IModelReplica = User;
    expect(() => erasedUser.getVersion('9.0.0')).toThrow(
      'model-version-unsupported',
    );
  });

  it.effect('carries and validates the complete resource', () =>
    Effect.gen(function* () {
      const mutation = yield* makeModelMutations(User).replicate(resource);
      const encoded = yield* encodeAppliedMutation({
        mutation: {
          ...mutation,
          commandId: 'cmd_replica_roundtrip',
          mutationIndex: 0,
          appliedAt: resource.updatedAt,
          lastAppliedAt: null,
          inverseOperation: null,
        },
      });
      const decoded = yield* decodeAppliedMutation({
        model: User,
        mutation: encoded,
      });

      expect(mutation.operationName).toBe('replicate');
      expect(mutation.modelVersion).toBe('1.0.0');
      expect(mutation.resourceId).toBe(resource.id);
      expect(mutation.operation.serviceName).toBe('directory');
      expect(mutation.operation.resource).toEqual(replicaResource);
      expect(encoded).toMatchObject({
        modelName: 'user',
        modelVersion: '1.0.0',
        operationName: 'replicate',
      });
      expect(decoded.model).toBe(User);
    }),
  );

  it.effect('encodes complete resources with JSON-compatible dates', () =>
    Effect.gen(function* () {
      const encoded = yield* Schema.encodeEffect(User.resourceSchema)(
        replicaResource,
      );
      const decoded = yield* Schema.decodeEffect(User.resourceSchema)(encoded);

      expect(encoded.createdAt).toBe(resource.createdAt.toISOString());
      expect(encoded.updatedAt).toBe(resource.updatedAt.toISOString());
      expect(decoded).toEqual(replicaResource);
    }),
  );

  it.effect(
    'inserts optimistically and rolls back a failed first replication',
    () =>
      Effect.gen(function* () {
        const db = yield* makeProvisionedInMemorySqljsDb({
          dbConfig,
        });
        const mutation = yield* makeModelMutations(User).replicate(resource);
        class Db extends Context.Service<Db, typeof db>()(
          'core/src/contracts/replicate.node.spec/Db',
        ) {
          static readonly Tx = Context.Service<
            'core/src/contracts/replicate.node.spec/Db.Tx',
            ITx<IDbConfig<IDbConfig['schema'], (typeof db)['_']['relations']>>
          >('core/src/contracts/replicate.node.spec/Db.Tx');
        }

        const applied = yield* makeTx(
          'replicateSpec.apply.transaction',
          Db,
        )(function* () {
          const tx = yield* Db.Tx;
          return yield* applyAggregateFrontendMutationTx({
            tx,
            mutation,
            commandId: 'cmd_replicated',
            mutationIndex: 0,
            appliedAt: resource.updatedAt,
          });
        })().pipe(Effect.provideService(Db, db));

        expect(
          db
            .select()
            .from(dbConfig.schema.user)
            .where(eq(dbConfig.schema.user.id, resource.id))
            .get()?.name,
        ).toBe('Replicated user');

        yield* makeTx(
          'replicateSpec.rollback.transaction',
          Db,
        )(function* () {
          const tx = yield* Db.Tx;
          yield* applyMutationInverseTx({ tx, mutation: applied });
        })().pipe(Effect.provideService(Db, db));
        expect(
          db
            .select()
            .from(dbConfig.schema.user)
            .where(eq(dbConfig.schema.user.id, resource.id))
            .get(),
        ).toBeUndefined();
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('revives and rolls back an existing frontend tombstone', () =>
    Effect.gen(function* () {
      const db = yield* makeProvisionedInMemorySqljsDb({
        dbConfig,
      });
      const tombstoneAt = new Date('2026-01-02T00:00:00.000Z');
      const revivedAt = new Date('2026-01-03T00:00:00.000Z');
      db.insert(dbConfig.schema.user)
        .values({
          ...resource,
          name: 'Original user',
          updatedAt: tombstoneAt,
          deletedAt: tombstoneAt,
          serviceIndex: null,
        })
        .run();
      const mutation = yield* makeModelMutations(User).replicate({
        ...resource,
        name: 'Replacement user',
        createdAt: revivedAt,
        updatedAt: revivedAt,
      });

      class Db extends Context.Service<Db, typeof db>()(
        'core/src/contracts/replicate.node.spec/Db',
      ) {
        static readonly Tx = Context.Service<
          'core/src/contracts/replicate.node.spec/Db.Tx',
          ITx<IDbConfig<IDbConfig['schema'], (typeof db)['_']['relations']>>
        >('core/src/contracts/replicate.node.spec/Db.Tx');
      }

      const applied = yield* makeTx(
        'replicateSpec.reviveTombstone.transaction',
        Db,
      )(function* () {
        const tx = yield* Db.Tx;
        return yield* applyAggregateFrontendMutationTx({
          tx,
          mutation,
          commandId: 'cmd_replicated_revival',
          mutationIndex: 0,
          appliedAt: revivedAt,
        });
      })().pipe(Effect.provideService(Db, db));

      expect(
        db
          .select()
          .from(dbConfig.schema.user)
          .where(eq(dbConfig.schema.user.id, resource.id))
          .get(),
      ).toMatchObject({
        name: 'Replacement user',
        updatedAt: revivedAt,
        deletedAt: null,
      });
      expect(applied.lastAppliedAt).toEqual(tombstoneAt);
      expect(applied.inverseOperation).toEqual({
        resource: expect.objectContaining({
          name: 'Original user',
          updatedAt: tombstoneAt,
          deletedAt: tombstoneAt,
          serviceIndex: null,
        }),
      });

      yield* makeTx(
        'replicateSpec.rollbackTombstoneRevival.transaction',
        Db,
      )(function* () {
        const tx = yield* Db.Tx;
        return yield* applyMutationInverseTx({ tx, mutation: applied });
      })().pipe(Effect.provideService(Db, db));
      expect(
        db
          .select()
          .from(dbConfig.schema.user)
          .where(eq(dbConfig.schema.user.id, resource.id))
          .get(),
      ).toMatchObject({
        name: 'Original user',
        updatedAt: tombstoneAt,
        deletedAt: tombstoneAt,
        serviceIndex: null,
      });
    }).pipe(Effect.provide(AsyncLive)),
  );
});
