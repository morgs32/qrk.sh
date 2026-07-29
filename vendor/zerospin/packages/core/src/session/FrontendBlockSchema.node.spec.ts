import { it } from '@effect/vitest';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { FrontendReplicaBlockSchema } from './FrontendBlockSchema.ts';

describe('FrontendReplicaBlockSchema', () => {
  it.effect('rejects excess properties at the replica wire boundary', () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknown(FrontendReplicaBlockSchema)(
        {
          kind: 'server',
          systemId: 'sys_1',
          generationId: 'gen_1',
          accountId: 'acct_1',
          accountName: 'account',
          actorId: 'actr_1',
          actorName: 'actor',
          frontendName: 'main',
          frontendVersion: '1.0.0',
          replicaIndex: 1,
          frontendIndex: 1,
          lineageBlock: {
            kind: 'generation-boundary',
            systemId: 'sys_1',
            prevGenerationId: 'gen_1',
            generationId: 'gen_2',
            accountId: 'acct_1',
            accountName: 'account',
            actorId: 'actr_1',
            actorName: 'actor',
            frontendName: 'main',
            frontendIndex: 1,
          },
          unexpected: true,
        },
        { onExcessProperty: 'error' },
      ).pipe(Effect.either);

      expect(decoded._tag).toBe('Left');
    }),
  );
});
