import { describe, expect, it } from '@effect/vitest';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeMigratedInMemorySqljsDb } from '../drizzle/makeMigratedInMemorySqljsDb.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';
import type { IServiceModel } from '../models/types.ts';

import { applyFrontendMutationTx } from './applyFrontendMutationTx.ts';
import { applyMutationInverseTx } from './applyMutationInverseTx.ts';

const User = makeServiceModel(
  {
    serviceName: 'directory',
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

const resource = {
  id: 'usr_replicated' as const,
  modelName: User.modelName,
  version: User.version,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  actorId: 'actr_replicated' as const,
  name: 'Replicated user',
};

describe('replicateResource', () => {
  it('rejects unknown schema and constructor versions', () => {
    const erasedUser: IServiceModel = User;

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
      const encoded = yield* Schema.encode(
        User.replicateResourceMutation('1.0.0'),
      )(mutation);
      const decoded = yield* Schema.decode(
        User.replicateResourceMutation('1.0.0'),
      )(encoded);

      expect(mutation.operationName).toBe('replicateResource');
      expect(mutation.modelVersion).toBe('1.0.0');
      expect(mutation.resourceId).toBe(resource.id);
      expect(mutation.operation.serviceName).toBe('directory');
      expect(mutation.operation.resource).toEqual(resource);
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
      const encoded = yield* Schema.encode(User.resourceSchema)(resource);
      const decoded = yield* Schema.decode(User.resourceSchema)(encoded);

      expect(encoded.createdAt).toBe(resource.createdAt.toISOString());
      expect(encoded.updatedAt).toBe(resource.updatedAt.toISOString());
      expect(decoded).toEqual(resource);
    }),
  );

  it.effect(
    'inserts optimistically and rolls back a failed first replication',
    () =>
      Effect.gen(function* () {
        const db = yield* makeMigratedInMemorySqljsDb({
          dbConfig: makeResourceDbConfig({ models: { user: User } }),
        });
        const mutation = yield* User.replicateResource('1.0.0', {
          resource,
        });
        const applied = yield* makeTx({
          db,
          program: Effect.fn('replicateResourceSpec.apply.transaction')(
            function* ({ tx }) {
              return yield* applyFrontendMutationTx({
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
            .from(User.drizzleSchema)
            .where(eq(User.drizzleSchema.id, resource.id))
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
            .from(User.drizzleSchema)
            .where(eq(User.drizzleSchema.id, resource.id))
            .get(),
        ).toBeUndefined();
      }).pipe(Effect.provide(AsyncLive)),
  );
});
