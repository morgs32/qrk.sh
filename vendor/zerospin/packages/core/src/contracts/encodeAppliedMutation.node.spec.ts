import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { User } from '../fixtures/system.ts';
import { makeModel } from '../models/makeModel.ts';
import { primitives } from '../models/primitives.ts';

import { decodeAppliedMutation } from './decodeAppliedMutation.ts';
import { encodeAppliedMutation } from './encodeAppliedMutation.ts';

describe('encodeAppliedMutation + decodeAppliedMutation', () => {
  it.effect('round-trips create with null inverse', () =>
    Effect.gen(function* () {
      const appliedAt = new Date('2020-01-01T00:00:00.000Z');
      const mutation = yield* User.create('1.0.0', {
        resourceId: 'usr_encode001' as const,
        attributes: { actorId: 'actr_encode001' as const, name: 'Alice' },
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
      const mutation = yield* User.update('1.0.0', {
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
    'decodes historical operation and inverse shapes with the stored modelVersion',
    () =>
      Effect.gen(function* () {
        const VersionedUser = makeModel(
          {
            abbreviation: 'vusr',
            modelName: 'versionedUser',
            attributes: {
              displayName: primitives.text(),
            },
            indexes: [],
            version: '2.0.0',
          },
          [
            {
              abbreviation: 'vusr',
              modelName: 'versionedUser',
              attributes: {
                name: primitives.text(),
              },
              indexes: [],
              version: '1.0.0',
            },
          ],
        );
        const mutation = yield* VersionedUser.update('1.0.0', {
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
