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
        authenticationSchema:
          authenticationFixtureFrontend.authentication.authenticationSchema,
        systemName: 'shopping',
        serviceVersion: '1.0.0',
        serviceName: 'catalog',
        name: 'web',
        models: {},
      });
      const right = makeFrontendController({
        authenticationSchema:
          authenticationFixtureFrontend.authentication.authenticationSchema,
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
        '38a18e726583e147821a00884ca3d2cb69e73e96e31e7b5d6834ed2f83a6744f',
      );
      expect(leftLock).not.toHaveProperty('kind');
      expect(leftLock).not.toHaveProperty('ownerName');
      expect(leftLock).not.toHaveProperty('contracts');
      expect(leftLock).not.toHaveProperty('userIdJsonSchema');
      expect(leftLock).not.toHaveProperty('signature');
    }),
  );
});
