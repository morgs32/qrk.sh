import { it } from '@effect/vitest';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import {
  AggregateFrontendBlockSchema,
  AggregateFrontendReplicaBlockSchema,
} from './AggregateFrontendBlockSchema.ts';

describe('AggregateFrontendReplicaBlockSchema', () => {
  it('decodes an ordinary generation-free frontend block', () => {
    const frontendBlock = {
      frontendName: 'main',
      lastAggregateCursor: 'acur_1',
      frontendIndex: 1,
      delta: { inserted: [], updated: [], deleted: [] },
      pendingPushedCommands: [],
      executedPushedCommands: [],
      failedPushedCommands: [],
    };
    expect(
      Schema.decodeUnknownSync(AggregateFrontendBlockSchema)(frontendBlock),
    ).toEqual(frontendBlock);
  });

  it.effect('rejects the removed rebased pushed cursor wire field', () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknown(
        AggregateFrontendReplicaBlockSchema,
      )(
        {
          kind: 'server',
          systemId: 'sys_1',
          aggregateId: 'acct_1',
          aggregateName: 'account',
          userId: 'user_1',
          frontendName: 'main',
          aggregateFrontendLockKey: 'lock_1',
          replicaIndex: 1,
          frontendIndex: 1,
          frontendBlock: {
            frontendName: 'main',
            frontendIndex: 1,
            lastAggregateCursor: 'acur_1',
            lastRebasedPushedCursor: null,
            delta: { inserted: [], updated: [], deleted: [] },
            pendingPushedCommands: [],
            executedPushedCommands: [],
            failedPushedCommands: [],
          },
        },
        { onExcessProperty: 'error' },
      ).pipe(Effect.either);

      expect(decoded._tag).toBe('Left');
    }),
  );
});
