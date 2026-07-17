import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { List } from '../fixtures/system.ts';

describe('deleteMutation', () => {
  it.effect('returns raw delete mutation', () =>
    Effect.gen(function* () {
      const mutation = yield* List.delete('1.0.0', {
        resourceId: 'lst_test' as const,
      });

      expect(mutation.model).toBe(List);
      expect(mutation.operationName).toBe('delete');
      expect('executedAt' in mutation).toBe(false);
      expect(mutation.operation).toEqual({});
    }),
  );
});
