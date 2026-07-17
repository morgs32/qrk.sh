import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { Item } from '../fixtures/system.ts';

describe('moveMutation', () => {
  it.effect('returns raw move mutation', () =>
    Effect.gen(function* () {
      const mutation = yield* Item.move('1.0.0', {
        resourceId: 'tsk_test' as const,
        property: 'listId',
        prevId: 'lst_prev' as const,
        nextId: 'lst_next' as const,
      });

      expect(mutation.model).toBe(Item);
      expect(mutation.operationName).toBe('move');
      expect('executedAt' in mutation).toBe(false);
      expect(mutation.operation).toEqual({
        property: 'listId',
        prevId: 'lst_prev',
        nextId: 'lst_next',
      });
    }),
  );
});
