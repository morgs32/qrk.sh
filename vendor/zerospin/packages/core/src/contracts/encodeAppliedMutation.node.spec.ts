import { it } from '@effect/vitest';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { User } from '../fixtures/system.ts';
import { models } from '../models/index.ts';

import { decodeAppliedMutation } from './decodeAppliedMutation.ts';
import {
  encodeAppliedMutation,
  EncodedMutationSchema,
  encodeMutation,
} from './encodeAppliedMutation.ts';
import { makeModelMutations } from './makeModelMutations.ts';

describe('encodeAppliedMutation + decodeAppliedMutation', () => {
  it.effect(
    'encodes a pre-application mutation without fabricated apply metadata',
    () =>
      Effect.gen(function* () {
        const mutation = yield* makeModelMutations(User).update({
          resourceId: User.prefixId('aggregate-frontend-mutation-001'),
          attributes: { name: 'Prepared name' },
        });

        const encoded = yield* encodeMutation({
          commandId: 'cmd_aggregate-frontend-mutation-001',
          mutationIndex: 3,
          mutation,
        });

        expect(encoded).toEqual({
          commandId: 'cmd_aggregate-frontend-mutation-001',
          mutationIndex: 3,
          modelName: User.modelName,
          modelVersion: User.version,
          resourceId: User.prefixId('aggregate-frontend-mutation-001'),
          operationName: 'update',
          operation: JSON.stringify({
            encodedAttributes: { name: 'Prepared name' },
          }),
        });
        expect('appliedAt' in encoded).toBe(false);
        expect('inverseOperation' in encoded).toBe(false);
      }),
  );

  it('decodes the exact pre-application frontend mutation envelope', () => {
    const encodedFrontendMutation = {
      commandId: 'cmd_frontend001',
      mutationIndex: 0,
      modelName: 'user',
      modelVersion: '1.0.0',
      resourceId: 'usr_frontend001',
      operationName: 'update',
      operation: '{"attributes":{"name":"Ada"}}',
    };

    expect(
      Schema.decodeUnknownSync(EncodedMutationSchema)(encodedFrontendMutation, {
        onExcessProperty: 'error',
      }),
    ).toEqual(encodedFrontendMutation);
    expect(() =>
      Schema.decodeUnknownSync(EncodedMutationSchema)(
        {
          ...encodedFrontendMutation,
          appliedAt: new Date('2020-01-01T00:00:00.000Z'),
        },
        { onExcessProperty: 'error' },
      ),
    ).toThrow();
  });

  it.effect('round-trips create with null inverse', () =>
    Effect.gen(function* () {
      const appliedAt = new Date('2020-01-01T00:00:00.000Z');
      const mutation = yield* makeModelMutations(User).create({
        resourceId: 'usr_encode001' as const,
        attributes: { name: 'Alice' },
      });

      const encoded = yield* encodeAppliedMutation({
        mutation: {
          ...mutation,
          commandId: 'cmd_encode001',
          mutationIndex: 0,
          appliedAt,
          lastAppliedAt: null,
          inverseOperation: null,
        },
      });
      const decoded = yield* decodeAppliedMutation({
        model: User,
        mutation: encoded,
      });

      expect(encoded.inverseOperation).toBe('null');
      expect(encoded.modelVersion).toBe('1.0.0');
      expect(decoded.operationName).toBe('create');
      expect(decoded.commandId).toBe('cmd_encode001');
      expect(decoded.mutationIndex).toBe(0);
      expect(decoded.inverseOperation).toBe(null);
      expect(decoded.appliedAt).toEqual(appliedAt);
      expect(decoded.lastAppliedAt).toBe(null);
    }),
  );

  it.effect('round-trips update inverse attributes', () =>
    Effect.gen(function* () {
      const appliedAt = new Date('2020-01-01T00:00:00.000Z');
      const lastAppliedAt = new Date('2019-12-31T00:00:00.000Z');
      const mutation = yield* makeModelMutations(User).update({
        resourceId: 'usr_encode002' as const,
        attributes: { name: 'Bob' },
      });

      const encoded = yield* encodeAppliedMutation({
        mutation: {
          ...mutation,
          commandId: 'cmd_encode002',
          mutationIndex: 1,
          appliedAt,
          lastAppliedAt,
          inverseOperation: { attributes: { name: 'Alice' } },
        },
      });
      const decoded = yield* decodeAppliedMutation({
        model: User,
        mutation: encoded,
      });

      expect(decoded.operationName).toBe('update');
      expect(typeof encoded.inverseOperation).toBe('string');
      expect(decoded.commandId).toBe('cmd_encode002');
      expect(decoded.mutationIndex).toBe(1);
      expect(decoded.lastAppliedAt).toEqual(lastAppliedAt);
      if (
        decoded.operationName === 'update' &&
        decoded.inverseOperation !== null
      ) {
        expect('attributes' in decoded.inverseOperation).toBe(true);
        if ('attributes' in decoded.inverseOperation) {
          expect(decoded.inverseOperation.attributes).toEqual({
            name: 'Alice',
          });
        }
      }
    }),
  );

  it.effect(
    'decodes operation and inverse shapes using the exact stored model version',
    () =>
      Effect.gen(function* () {
        const VersionedUser = models.makeVersion(
          models.makeModel({ name: 'versionedUser', abbreviation: 'vusr' }),
          {
            attributes: {
              name: primitives.text(),
            },
            indexes: [],
            version: '1.0.0',
          },
        );
        const mutation = yield* makeModelMutations(VersionedUser).update({
          resourceId: VersionedUser.prefixId('historical001'),
          attributes: { name: 'New legacy name' },
        });

        const encoded = yield* encodeAppliedMutation({
          mutation: {
            ...mutation,
            commandId: 'cmd_historical001',
            mutationIndex: 0,
            appliedAt: new Date('2020-01-01T00:00:00.000Z'),
            lastAppliedAt: null,
            inverseOperation: { attributes: { name: 'Old legacy name' } },
          },
        });
        const decoded = yield* decodeAppliedMutation({
          model: VersionedUser,
          mutation: encoded,
        });

        expect(decoded.modelVersion).toBe('1.0.0');
        expect(decoded.operationName).toBe('update');
        if (decoded.operationName === 'update') {
          expect(decoded.operation.attributes).toEqual({
            name: 'New legacy name',
          });
          expect(decoded.inverseOperation).toEqual({
            attributes: { name: 'Old legacy name' },
          });
        }
      }),
  );
});
