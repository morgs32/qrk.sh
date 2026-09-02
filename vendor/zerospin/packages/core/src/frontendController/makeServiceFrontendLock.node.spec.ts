import { it } from '@effect/vitest';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { makeFrontendController } from './makeFrontendController.ts';
import {
  makeServiceFrontendLock,
  ServiceFrontendLockSchema,
} from './makeServiceFrontendLock.ts';
import { makeServiceFrontendLockKey } from './makeServiceFrontendLockKey.ts';

describe('service frontend lock', () => {
  it.effect('omits owner identity and hashes the exact selection', () =>
    Effect.gen(function* () {
      const left = makeFrontendController({
        systemName: 'shopping',
        serviceName: 'catalog',
        frontendName: 'web',
        models: {},
      });
      const right = makeFrontendController({
        systemName: 'shopping',
        serviceName: 'inventory',
        frontendName: 'web',
        models: {},
      });

      const leftLock = makeServiceFrontendLock({ frontend: left });
      const rightLock = makeServiceFrontendLock({ frontend: right });
      const leftKey = yield* makeServiceFrontendLockKey(leftLock);
      const rightKey = yield* makeServiceFrontendLockKey(rightLock);

      expect(Schema.is(ServiceFrontendLockSchema)(leftLock)).toBe(true);
      expect(leftLock).toEqual(rightLock);
      expect(leftKey).toBe(rightKey);
      expect(leftKey).toBe(
        'bef33d25b9d7c8981a1b7975a3ea108517409a0479c538c7f38ee3a226159c67',
      );
      expect(leftLock).not.toHaveProperty('kind');
      expect(leftLock).not.toHaveProperty('ownerName');
      expect(leftLock).not.toHaveProperty('contracts');
      expect(leftLock).not.toHaveProperty('userIdJsonSchema');
      expect(leftLock).not.toHaveProperty('signature');
    }),
  );
});
