import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { User } from '../fixtures/system.ts';

describe('createMutation', () => {
  it.effect('returns raw create mutation', () =>
    Effect.gen(function* () {
      const mutation = yield* User.create('1.0.0', {
        resourceId: 'usr_test' as const,
        attributes: {
          actorId: 'actr_test' as const,
          name: 'Alice',
        },
      });

      expect(mutation.model).toBe(User);
      expect(mutation.operationName).toBe('create');
      expect('executedAt' in mutation).toBe(false);
    }),
  );

  it.effect('fails when attributes incomplete', () =>
    Effect.gen(function* () {
      const maybeMutation = yield* User.create('1.0.0', {
        resourceId: 'usr_test' as const,
        attributes: {
          name: 'Alice',
        } as { actorId: string; name: string },
      }).pipe(Effect.either);

      expect(maybeMutation._tag).toBe('Left');
      if (maybeMutation._tag === 'Left') {
        expect(maybeMutation.left.code).toBe(
          'create-resource-missing-attributes',
        );
        expect(maybeMutation.left.message).toContain('actorId');
      }
    }),
  );
});
