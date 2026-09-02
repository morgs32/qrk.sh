import { describe, expect, it } from '@effect/vitest';
import { primitives } from '@zerospin/schema';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeProvisionedInMemorySqljsDb } from '../drizzle/makeProvisionedInMemorySqljsDb.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import { makeModel } from '../models/makeModel.ts';
import { makeReplica } from '../models/makeReplica.ts';
import type { IModelReplica } from '../models/types.ts';

import { applyAggregateFrontendMutationTx } from './applyAggregateFrontendMutationTx.ts';
import { applyMutationInverseTx } from './applyMutationInverseTx.ts';

const SourceUser = makeModel({
  abbreviation: 'usr',
  modelName: 'user',
  attributes: {
    userId: primitives.opaqueId({ abbreviation: 'uid', unique: true }),
    name: primitives.text({ nullable: true }),
  },
  indexes: [],
  version: '1.0.0',
});
const User = makeReplica({
  sourceModel: SourceUser,
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
const replicaResource = { ...resource, deletedAt: null };

describe('replicateResource', () => {
  it('rejects unknown schema and constructor versions', () => {
    const erasedUser: IModelReplica = User;

    expect(() => erasedUser.replicateResourceMutation('9.0.0')).toThrow(
      /Unknown model version "9.0.0" for "user"/,
    );
    expect(() => erasedUser.replicateResource('9.0.0', { resource })).toThrow(
      /Unknown model version "9.0.0" for "user"/,
    );
  });

  it.effect('carries and validates the complete resource', () =>
    Effect.gen(function* () {
      const mutation = yield* User.replicateResource('1.0.0', {
        resource,
      });
      const encoded = yield* Schema.encodeEffect(
        User.replicateResourceMutation('1.0.0'),
      )(mutation);
      const decoded = yield* Schema.decodeEffect(
        User.replicateResourceMutation('1.0.0'),
      )(encoded);

      expect(mutation.operationName).toBe('replicateResource');
      expect(mutation.modelVersion).toBe('1.0.0');
      expect(mutation.resourceId).toBe(resource.id);
      expect(mutation.operation.serviceName).toBe('directory');
      expect(mutation.operation.resource).toEqual(replicaResource);
      expect(encoded).toMatchObject({
        modelName: 'user',
        modelVersion: '1.0.0',
        operationName: 'replicateResource',
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
        const mutation = yield* User.replicateResource('1.0.0', {
          resource,
        });
        const applied = yield* makeTx({
          db,
          program: Effect.fn('replicateResourceSpec.apply.transaction')(
            function* ({ tx }) {
              return yield* applyAggregateFrontendMutationTx({
                tx,
                mutation,
                commandId: 'cmd_replicated',
                mutationIndex: 0,
                appliedAt: resource.updatedAt,
              });
            },
          ),
        });

        expect(
          db
            .select()
            .from(dbConfig.schema.user)
            .where(eq(dbConfig.schema.user.id, resource.id))
            .get()?.name,
        ).toBe('Replicated user');

        yield* makeTx({
          db,
          program: Effect.fn('replicateResourceSpec.rollback.transaction')(
            function* ({ tx }) {
              yield* applyMutationInverseTx({ tx, mutation: applied });
            },
          ),
        });
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
        })
        .run();
      const mutation = yield* User.replicateResource('1.0.0', {
        resource: {
          ...resource,
          name: 'Replacement user',
          createdAt: revivedAt,
          updatedAt: revivedAt,
        },
      });

      const applied = yield* makeTx({
        db,
        program: Effect.fn('replicateResourceSpec.reviveTombstone.transaction')(
          function* ({ tx }) {
            return yield* applyAggregateFrontendMutationTx({
              tx,
              mutation,
              commandId: 'cmd_replicated_revival',
              mutationIndex: 0,
              appliedAt: revivedAt,
            });
          },
        ),
      });

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
        }),
      });

      yield* makeTx({
        db,
        program: Effect.fn(
          'replicateResourceSpec.rollbackTombstoneRevival.transaction',
        )(function* ({ tx }) {
          return yield* applyMutationInverseTx({ tx, mutation: applied });
        }),
      });
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
      });
    }).pipe(Effect.provide(AsyncLive)),
  );
});
