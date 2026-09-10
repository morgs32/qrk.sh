import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { User } from '../fixtures/system.ts';

import { makeModelMutations } from './makeModelMutations.ts';

describe('createMutation', () => {
  it.effect('returns raw create mutation', () =>
    Effect.gen(function* () {
      const mutation = yield* makeModelMutations(User).create({
        resourceId: 'usr_test' as const,
        attributes: { name: 'Alice' },
      });

      expect(mutation.model).toBe(User);
      expect(mutation.operationName).toBe('create');
      expect('executedAt' in mutation).toBe(false);
    }),
  );

  it.effect('fails when attributes incomplete', () =>
    Effect.gen(function* () {
      const maybeMutation = yield* makeModelMutations(User)
        .create({
          resourceId: 'usr_test' as const,
          // @ts-expect-error runtime validation rejects incomplete attributes
          attributes: {},
        })
        .pipe(Effect.result);

      expect(maybeMutation._tag).toBe('Failure');
      if (maybeMutation._tag === 'Failure') {
        expect(maybeMutation.failure.code).toBe(
          'create-resource-missing-attributes',
        );
        expect(maybeMutation.failure.message).toContain('name');
      }
    }),
  );
});
