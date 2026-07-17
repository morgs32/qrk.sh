import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { User } from '../fixtures/system.ts';

describe('updateMutation', () => {
  it.effect('returns raw update mutation', () =>
    Effect.gen(function* () {
      const mutation = yield* User.update('1.0.0', {
        resourceId: 'usr_test' as const,
        attributes: { name: 'Alice' },
      });

      expect(mutation.model).toBe(User);
      expect(mutation.operationName).toBe('update');
      expect('executedAt' in mutation).toBe(false);
      expect(mutation.operation.attributes).toEqual({ name: 'Alice' });
    }),
  );
});
