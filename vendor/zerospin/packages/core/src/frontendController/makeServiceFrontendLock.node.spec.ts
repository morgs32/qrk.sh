import { it } from '@effect/vitest';
import { main as authenticationFixtureFrontend } from '@zerospin/core/fixtures/system';
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
        authentication: authenticationFixtureFrontend.authentication,
        systemName: 'shopping',
        serviceVersion: '1.0.0',
        serviceName: 'catalog',
        name: 'web',
        models: {},
      });
      const right = makeFrontendController({
        authentication: authenticationFixtureFrontend.authentication,
        systemName: 'shopping',
        serviceVersion: '1.0.0',
        serviceName: 'inventory',
        name: 'web',
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
        '21c0724422a3ddac1dd941993f5ebf7d7e58e2850c44192f2e6f1d4f4637aa22',
      );
      expect(leftLock).not.toHaveProperty('kind');
      expect(leftLock).not.toHaveProperty('ownerName');
      expect(leftLock).not.toHaveProperty('contracts');
      expect(leftLock).not.toHaveProperty('userIdJsonSchema');
      expect(leftLock).not.toHaveProperty('signature');
    }),
  );
});
