import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect, vi } from 'vitest';

import { managedRuntime } from '../managedRuntime.js';
import type { IServiceBlock } from '../types.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';

import { getServiceBlockRepo } from './getServiceBlockRepo/getServiceBlockRepo.js';
import { ServiceBlockRepo } from './ServiceBlockRepo.js';

describe('ServiceBlockRepo', () => {
  it.effect(
    'rejects service frontend repo names outside the owning source and exact target',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_service_frontend_subscription_identity',
          serviceName: 'catalog',
        };
        const repo = yield* getServiceBlockRepo({ key });

        // 1 — the target generation encoded in the subscriber name must be
        // the generation that owns this physical ServiceBlockRepo.
        const wrongSource = yield* makeAsync(() =>
          repo.subscribeServiceFrontend({
            serviceFrontendRepoName:
              'svcfrtrepo_gen_other/catalog/member/actr_service_frontend_identity/memberFrontend',
            serviceName: key.serviceName,
            actorName: 'member',
            actorId: 'actr_service_frontend_identity',
            frontendName: 'memberFrontend',
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
              'svcfrtrepo_gen_service_frontend_subscription_identity/catalog/member/actr_other/memberFrontend',
            serviceName: key.serviceName,
            actorName: 'member',
            actorId: 'actr_service_frontend_identity',
            frontendName: 'memberFrontend',
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

  it.effect(
    'drains both subscriber queues through the lifecycle alarm',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_service_block_lifecycle_alarm',
          serviceName: 'catalog',
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

  it.effect(
    'does not let an older failed drain delete the newer shared alarm',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_service_frontend_drain_alarm',
          serviceName: 'catalog',
        };
        const repo = yield* getServiceBlockRepo({ key });
        const sourceBlock: IServiceBlock = {
          executedCommands: [],
          failedCommands: [],
          appliedMutations: [],
          lastServiceCursor: 'svcur_service_frontend_drain_alarm_1',
          serviceIndex: 1,
        };
        const serviceFrontendRepoName =
          'svcfrtrepo_gen_service_frontend_drain_alarm/catalog/member/actr_service_frontend_drain_alarm/memberFrontend';

        yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getServiceBlockRepo,
            repo: ServiceBlockRepo,
            key,
            fn: ({ db, schema }) => {
              db.insert(schema.serviceBlocks)
                .values({
                  lastServiceCursor: sourceBlock.lastServiceCursor,
                  serviceIndex: sourceBlock.serviceIndex,
                  block: JSON.stringify(sourceBlock),
                })
                .run();
              db.insert(schema.serviceFrontendSubscribers)
                .values({
                  serviceFrontendRepoName,
                  serviceName: key.serviceName,
                  actorName: 'member',
                  actorId: 'actr_service_frontend_drain_alarm',
                  frontendName: 'memberFrontend',
                  currentServiceCursor: null,
                  currentServiceIndex: null,
                  catchupThroughServiceCursor: null,
                  catchupThroughServiceIndex: null,
                  status: 'live',
                  lastDeliveryError: null,
                })
                .run();
            },
          }),
        );

        // 1 — this invocation claims sequence 1, then suspends while its
        // uninitialized ServiceFrontendRepo delivery exhausts bounded retries.
        const olderDrain = Effect.runPromise(
          makeAsync(() => repo.drainServiceFrontendSubscribers()).pipe(
            Effect.flatMap(decodeRpc),
            Effect.provide(AsyncLive),
          ),
        );
        yield* Effect.promise(() =>
          vi.waitFor(async () => {
            const drainSequence = await executeInRepo({
              managedRuntime,
              getRepo: getServiceBlockRepo,
              repo: ServiceBlockRepo,
              key,
              fn: ({ storage }) =>
                storage.get<number>('serviceBlockSubscriberDrainSequence'),
            });
            expect(drainSequence).toBe(1);
          }),
        );

        // 2 — remove the stale service delivery and add one future account
        // retry. The overlapping drain claims sequence 2 and installs that
        // exact retry deadline as the shared alarm.
        const newerAlarmAt = Date.now() + 60_000;
        yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getServiceBlockRepo,
            repo: ServiceBlockRepo,
            key,
            fn: ({ db, schema }) => {
              db.delete(schema.serviceFrontendSubscribers)
                .where(
                  eq(
                    schema.serviceFrontendSubscribers.serviceFrontendRepoName,
                    serviceFrontendRepoName,
                  ),
                )
                .run();
              db.insert(schema.accountSubscribers)
                .values({
                  accountRepoName:
                    'acctrepo_gen_service_frontend_drain_alarm/acct_service_frontend_drain_alarm/user',
                  accountId: 'acct_service_frontend_drain_alarm',
                  accountName: 'user',
                  currentServiceCursor: sourceBlock.lastServiceCursor,
                  currentServiceIndex: sourceBlock.serviceIndex,
                  deliveryAttempts: 1,
                  nextRetryAt: newerAlarmAt,
                  lastDeliveryError: 'deferred account retry',
                })
                .run();
            },
          }),
        );
        yield* makeAsync(() => repo.drainServiceFrontendSubscribers()).pipe(
          Effect.flatMap(decodeRpc),
        );
        yield* Effect.promise(() => olderDrain);

        // 3 — the stale failure has no remaining subscriber to diagnose. Its
        // older sequence therefore cannot delete the alarm owned by sequence 2.
        const settled = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getServiceBlockRepo,
            repo: ServiceBlockRepo,
            key,
            fn: async ({ storage }) => ({
              alarm: await storage.getAlarm(),
              drainSequence: await storage.get<number>(
                'serviceBlockSubscriberDrainSequence',
              ),
            }),
          }),
        );
        expect(settled).toEqual({
          alarm: newerAlarmAt,
          drainSequence: 2,
        });
      }).pipe(Effect.provide(AsyncLive)),
  );
});
