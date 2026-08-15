import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { getServiceBlockRepo } from './getServiceBlockRepo/getServiceBlockRepo.js';

describe('ServiceBlockRepo', () => {
  it.effect(
    'rejects service frontend repo names outside the owning source and exact target',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_service_frontend_subscription_identity',
          serviceName: 'app',
        };
        const repo = yield* getServiceBlockRepo({ key });

        // 1 — the target generation encoded in the subscriber name must be
        // the generation that owns this physical ServiceBlockRepo.
        const wrongSource = yield* makeAsync(() =>
          repo.subscribeServiceFrontend({
            serviceFrontendRepoName:
              'svcfrtrepo_gen_other/app/user_service_frontend_identity/products',
            serviceName: key.serviceName,
            userId: 'user_service_frontend_identity',
            frontendName: 'products',
            currentServiceCursor: null,
            currentServiceIndex: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(wrongSource._tag).toBe('Left');
        if (wrongSource._tag === 'Left') {
          expect(wrongSource.left.code).toBe(
            'service-block-service-frontend-source-target-mismatch',
          );
        }

        // 2 — matching source identity is insufficient when the same repo
        // name encodes a different actor than the supplied logical target.
        const wrongTarget = yield* makeAsync(() =>
          repo.subscribeServiceFrontend({
            serviceFrontendRepoName:
              'svcfrtrepo_gen_service_frontend_subscription_identity/app/user_other/products',
            serviceName: key.serviceName,
            userId: 'user_service_frontend_identity',
            frontendName: 'products',
            currentServiceCursor: null,
            currentServiceIndex: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(wrongTarget._tag).toBe('Left');
        if (wrongTarget._tag === 'Left') {
          expect(wrongTarget.left.code).toBe(
            'service-block-service-frontend-repo-target-mismatch',
          );
        }

        // 3 — both typed failures happen before a durable subscriber binding
        // exists, so a later drain cannot dispatch either forged target.
        const subscriberCount = yield* Effect.promise(() =>
          runInDurableObject(repo, (_instance, state) =>
            state.storage.sql
              .exec<{ count: number }>(
                'SELECT COUNT(*) AS count FROM serviceFrontendSubscribers',
              )
              .one(),
          ),
        );
        expect(subscriberCount.count).toBe(0);
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('drains both subscriber queues through the lifecycle alarm', () =>
    Effect.gen(function* () {
      const key = {
        generationId: 'gen_service_block_lifecycle_alarm',
        serviceName: 'app',
      };
      const repo = yield* getServiceBlockRepo({ key });

      yield* Effect.promise(() =>
        runInDurableObject(repo, (_instance, state) =>
          state.storage.setAlarm(Date.now() + 60_000),
        ),
      );

      const didRunAlarm = yield* Effect.promise(() =>
        runDurableObjectAlarm(repo),
      );
      expect(didRunAlarm).toBe(true);

      const scheduledAlarm = yield* Effect.promise(() =>
        runInDurableObject(repo, (_instance, state) =>
          state.storage.getAlarm(),
        ),
      );
      expect(scheduledAlarm).toBeNull();
    }).pipe(Effect.provide(AsyncLive)),
  );
});
