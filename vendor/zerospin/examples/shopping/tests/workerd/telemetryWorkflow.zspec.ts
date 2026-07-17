/*
 * Shopping workerd annotation:
 * Proves that the public SystemApi finalization path persists its synchronous
 * trace, then links a failed actor drain to the succeeding alarm retry.
 */

import { describe, it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAccountId } from '@zerospin/core/utils/makeAccountId';
import { prefixActorId } from '@zerospin/core/utils/prefixActorId';
import { makeTestApis } from '@zerospin/dispatch-worker/makeTestApis';
import { makeWorkerdE2eTestLayer } from '@zerospin/dispatch-worker/vitest/makeWorkerdE2eTestLayer';
import { runDurableObjectAlarm } from 'cloudflare:test';
import { and, eq, isNull } from 'drizzle-orm';
import { Effect } from 'effect';
import { AccountBlockRepo } from 'system-worker/AccountBlockRepo/AccountBlockRepo';
import { getAccountBlockRepo } from 'system-worker/AccountBlockRepo/getAccountBlockRepo/getAccountBlockRepo';
import { ActorRepo } from 'system-worker/ActorRepo/ActorRepo';
import { getActorRepo } from 'system-worker/ActorRepo/getActorRepo/getActorRepo';
import { managedRuntime } from 'system-worker/managedRuntime';
import { getSystemLogRepo } from 'system-worker/SystemLogRepo/getSystemLogRepo/getSystemLogRepo';
import { SystemLogRepo } from 'system-worker/SystemLogRepo/SystemLogRepo';
import { executeInRepo } from 'system-worker/workerd-utils/executeInRepo';
import { expect, vi } from 'vitest';

import { shopperFrontend } from '@/zerospin/frontend';
import { User } from '@/zerospin/models';
import { system, userAccount } from '@/zerospin/system';

const E2E_ACCOUNT_ID = makeAccountId({ id: '1' });
const E2E_CLERK_USER_ID = 'user_telemetry';
const E2E_ACTOR_ID = prefixActorId(E2E_CLERK_USER_ID);
const TestLayer = makeWorkerdE2eTestLayer('telemetryWorkflow');

describe('public SystemApi telemetry persistence', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'stores request, failed drain, and successful alarm traces with causal links',
      () =>
        Effect.gen(function* () {
          const accountBlockRepo = yield* getAccountBlockRepo({
            key: {
              generationId: 'gen_test',
              accountId: E2E_ACCOUNT_ID,
              accountName: shopperFrontend.accountName,
            },
          });

          /*
           * 1. Create the account and bootstrap the real ActorRepo subscriber
           * before the measured workflow. This keeps the retry from creating a
           * new ActorRepo, which would legitimately schedule another drain.
           */
          const apis = makeTestApis();
          const systemApi = yield* makeAsync(() =>
            apis.getSystemApi({ zerospinSecretKey: 'sk_telemetry' }),
          );
          const createUserCommand = yield* userAccount.makeCommand({
            contractName: 'createUser',
            accountId: E2E_ACCOUNT_ID,
            systemName: shopperFrontend.systemName,
            systemVersion: system.version,
            payload: {
              id: User.prefixId(E2E_CLERK_USER_ID),
              clerkUserId: E2E_CLERK_USER_ID,
            },
          });
          const setupBlock = yield* makeAsync(() =>
            systemApi.finalizeAccountCommands({
              traceContext: null,
              args: [
                {
                  accountId: E2E_ACCOUNT_ID,
                  accountName: shopperFrontend.accountName,
                  commands: [createUserCommand],
                },
              ],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          yield* makeAsync(() =>
            apis.getFrontendApi({
              publishableKey: 'pk_telemetry',
              accountName: shopperFrontend.accountName,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              signature: { clerkUserId: E2E_CLERK_USER_ID },
            }),
          );

          yield* Effect.promise(() =>
            vi.waitFor(
              async () => {
                const setupDrain = await executeInRepo({
                  managedRuntime,
                  getRepo: getSystemLogRepo,
                  repo: SystemLogRepo,
                  key: { generationId: 'gen_test' },
                  fn: ({ db, schema }) =>
                    db
                      .select()
                      .from(schema.telemetrySpans)
                      .where(
                        eq(
                          schema.telemetrySpans.name,
                          'AccountBlockRepo.drainActorOutbox',
                        ),
                      )
                      .get(),
                });
                expect(setupDrain).toBeDefined();
              },
              { timeout: 10_000 },
            ),
          );
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getSystemLogRepo,
              repo: SystemLogRepo,
              key: { generationId: 'gen_test' },
              fn: ({ db, schema }) => {
                db.delete(schema.telemetryLinks).run();
                db.delete(schema.telemetryLogs).run();
                db.delete(schema.telemetrySpans).run();
              },
            }),
          );

          /*
           * 2. Corrupt only the existing ActorRepo cursor marker, then enter
           * through the actual public SystemApi. The first delivery returns a
           * real encoded domain error; the alarm retry runs after restoration.
           */
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getActorRepo,
              repo: ActorRepo,
              key: {
                generationId: 'gen_test',
                accountId: E2E_ACCOUNT_ID,
                accountName: shopperFrontend.accountName,
                actorId: E2E_ACTOR_ID,
                actorName: shopperFrontend.actorName,
              },
              fn: ({ storage }) =>
                storage.kv.put('lastAccountIndex', 'invalid-account-index'),
            }),
          );
          const updateUserCommand = yield* userAccount.makeCommand({
            contractName: 'updateUser',
            accountId: E2E_ACCOUNT_ID,
            systemName: shopperFrontend.systemName,
            systemVersion: system.version,
            payload: {
              id: User.prefixId(E2E_CLERK_USER_ID),
              name: 'Telemetry Retry User',
            },
          });
          const finalizedBlock = yield* makeAsync(() =>
            systemApi.finalizeAccountCommands({
              traceContext: null,
              args: [
                {
                  accountId: E2E_ACCOUNT_ID,
                  accountName: shopperFrontend.accountName,
                  commands: [updateUserCommand],
                },
              ],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));

          expect(finalizedBlock.failedCommands).toEqual([]);
          expect(finalizedBlock.executedCommands).toHaveLength(1);
          expect(finalizedBlock.executedCommands[0]?.id).toBe(
            updateUserCommand.id,
          );

          /*
           * 3. Wait for AccountBlockRepo.publish's real waitUntil drain. The
           * durable subscriber failure proves that the first deferred trace
           * has finished without adding a second explicit drain invocation.
           */
          yield* Effect.promise(() =>
            vi.waitFor(
              async () => {
                const failedSubscriber = await executeInRepo({
                  managedRuntime,
                  getRepo: getAccountBlockRepo,
                  repo: AccountBlockRepo,
                  key: {
                    generationId: 'gen_test',
                    accountId: E2E_ACCOUNT_ID,
                    accountName: shopperFrontend.accountName,
                  },
                  fn: ({ db, schema }) =>
                    db.select().from(schema.actorSubscribers).get(),
                });
                expect(failedSubscriber?.deliveryAttempts).toBe(1);
                expect(failedSubscriber?.failedAt).not.toBeNull();
              },
              { timeout: 10_000 },
            ),
          );

          /*
           * 4. Repair the durable subscriber and make its recorded retry due.
           * Running the actual Durable Object alarm must deliver the same block
           * successfully and persist an alarm root linked to the failed drain.
           */
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getActorRepo,
              repo: ActorRepo,
              key: {
                generationId: 'gen_test',
                accountId: E2E_ACCOUNT_ID,
                accountName: shopperFrontend.accountName,
                actorId: E2E_ACTOR_ID,
                actorName: shopperFrontend.actorName,
              },
              fn: ({ storage }) =>
                storage.kv.put('lastAccountIndex', setupBlock.accountIndex),
            }),
          );
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountBlockRepo,
              repo: AccountBlockRepo,
              key: {
                generationId: 'gen_test',
                accountId: E2E_ACCOUNT_ID,
                accountName: shopperFrontend.accountName,
              },
              fn: ({ db, schema }) =>
                db
                  .update(schema.actorSubscribers)
                  .set({
                    nextRetryAt: 0,
                  })
                  .run(),
            }),
          );
          const didRunAlarm = yield* Effect.promise(() =>
            runDurableObjectAlarm(accountBlockRepo),
          );
          expect(didRunAlarm).toBe(true);

          const deliveredSubscriber = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountBlockRepo,
              repo: AccountBlockRepo,
              key: {
                generationId: 'gen_test',
                accountId: E2E_ACCOUNT_ID,
                accountName: shopperFrontend.accountName,
              },
              fn: ({ db, schema }) =>
                db.select().from(schema.actorSubscribers).get(),
            }),
          );
          expect(deliveredSubscriber).toEqual(
            expect.objectContaining({
              currentAccountCursor: finalizedBlock.lastAccountCursor,
              currentAccountIndex: finalizedBlock.accountIndex,
              deliveryAttempts: 0,
              nextRetryAt: null,
              lastDeliveryError: null,
              failedAt: null,
              succeededAt: expect.any(Number),
            }),
          );

          /*
           * 5. Read the real SystemLogRepo tables and resolve each link endpoint back
           * to its stored span. This verifies the three-root DAG without using
           * an in-memory collector from the test process.
           */
          const telemetry = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getSystemLogRepo,
              repo: SystemLogRepo,
              key: { generationId: 'gen_test' },
              fn: ({ db, schema }) => {
                const roots = db
                  .select()
                  .from(schema.telemetrySpans)
                  .where(isNull(schema.telemetrySpans.parentSpanId))
                  .all();
                const requestRoot = db
                  .select()
                  .from(schema.telemetrySpans)
                  .where(
                    eq(
                      schema.telemetrySpans.name,
                      'SystemApi.finalizeAccountCommands',
                    ),
                  )
                  .get();
                const drainRoot = db
                  .select()
                  .from(schema.telemetrySpans)
                  .where(
                    and(
                      isNull(schema.telemetrySpans.parentSpanId),
                      eq(
                        schema.telemetrySpans.name,
                        'AccountBlockRepo.drainActorOutbox',
                      ),
                    ),
                  )
                  .get();
                const alarmRoot = db
                  .select()
                  .from(schema.telemetrySpans)
                  .where(
                    and(
                      isNull(schema.telemetrySpans.parentSpanId),
                      eq(schema.telemetrySpans.name, 'AccountBlockRepo.alarm'),
                    ),
                  )
                  .get();
                const requestSpans =
                  requestRoot === undefined
                    ? []
                    : db
                        .select()
                        .from(schema.telemetrySpans)
                        .where(
                          eq(
                            schema.telemetrySpans.traceId,
                            requestRoot.traceId,
                          ),
                        )
                        .all();
                const accountRepoFinalizeSpans =
                  requestRoot === undefined
                    ? []
                    : db
                        .select()
                        .from(schema.telemetrySpans)
                        .where(
                          and(
                            eq(
                              schema.telemetrySpans.traceId,
                              requestRoot.traceId,
                            ),
                            eq(
                              schema.telemetrySpans.name,
                              'AccountRepo.finalizeAccountBlock.rpc',
                            ),
                          ),
                        )
                        .all();
                const accountBlockPublishSpans =
                  requestRoot === undefined
                    ? []
                    : db
                        .select()
                        .from(schema.telemetrySpans)
                        .where(
                          and(
                            eq(
                              schema.telemetrySpans.traceId,
                              requestRoot.traceId,
                            ),
                            eq(
                              schema.telemetrySpans.name,
                              'AccountBlockRepo.publish',
                            ),
                          ),
                        )
                        .all();
                const failedActorSpans =
                  drainRoot === undefined
                    ? []
                    : db
                        .select()
                        .from(schema.telemetrySpans)
                        .where(
                          and(
                            eq(
                              schema.telemetrySpans.traceId,
                              drainRoot.traceId,
                            ),
                            eq(
                              schema.telemetrySpans.name,
                              'ActorRepo.handleAccountBlocks',
                            ),
                          ),
                        )
                        .all();
                const retriedActorSpans =
                  alarmRoot === undefined
                    ? []
                    : db
                        .select()
                        .from(schema.telemetrySpans)
                        .where(
                          and(
                            eq(
                              schema.telemetrySpans.traceId,
                              alarmRoot.traceId,
                            ),
                            eq(
                              schema.telemetrySpans.name,
                              'ActorRepo.handleAccountBlocks',
                            ),
                          ),
                        )
                        .all();
                const causedBy = db
                  .select()
                  .from(schema.telemetryLinks)
                  .where(eq(schema.telemetryLinks.kind, 'causedBy'))
                  .get();
                const causedByPrior =
                  causedBy === undefined
                    ? undefined
                    : db
                        .select()
                        .from(schema.telemetrySpans)
                        .where(
                          eq(
                            schema.telemetrySpans.spanId,
                            causedBy.priorSpanId,
                          ),
                        )
                        .get();
                const causedByCurrent =
                  causedBy === undefined
                    ? undefined
                    : db
                        .select()
                        .from(schema.telemetrySpans)
                        .where(
                          eq(schema.telemetrySpans.spanId, causedBy.spanId),
                        )
                        .get();
                const retryOf = db
                  .select()
                  .from(schema.telemetryLinks)
                  .where(eq(schema.telemetryLinks.kind, 'retryOf'))
                  .get();
                const retryOfPrior =
                  retryOf === undefined
                    ? undefined
                    : db
                        .select()
                        .from(schema.telemetrySpans)
                        .where(
                          eq(schema.telemetrySpans.spanId, retryOf.priorSpanId),
                        )
                        .get();
                const retryOfCurrent =
                  retryOf === undefined
                    ? undefined
                    : db
                        .select()
                        .from(schema.telemetrySpans)
                        .where(eq(schema.telemetrySpans.spanId, retryOf.spanId))
                        .get();

                return {
                  roots,
                  requestSpans,
                  accountRepoFinalizeSpans,
                  accountBlockPublishSpans,
                  failedActorSpans,
                  retriedActorSpans,
                  causedBy,
                  causedByPrior,
                  causedByCurrent,
                  retryOf,
                  retryOfPrior,
                  retryOfCurrent,
                };
              },
            }),
          );

          expect(telemetry.roots).toHaveLength(3);
          expect(telemetry.roots).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                name: 'SystemApi.finalizeAccountCommands',
                status: 'ok',
              }),
              expect.objectContaining({
                name: 'AccountBlockRepo.drainActorOutbox',
                status: 'ok',
              }),
              expect.objectContaining({
                name: 'AccountBlockRepo.alarm',
                status: 'ok',
              }),
            ]),
          );
          expect(telemetry.requestSpans).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                name: 'SystemApi.finalizeAccountCommands',
              }),
              expect.objectContaining({
                name: 'SystemWorker.finalizeAccountBlock',
              }),
              expect.objectContaining({
                name: 'AccountRepo.finalizeAccountBlock.rpc',
              }),
              expect.objectContaining({
                name: 'AccountBlockRepo.publish',
              }),
            ]),
          );
          expect(telemetry.accountRepoFinalizeSpans).toHaveLength(1);
          expect(telemetry.accountBlockPublishSpans).toHaveLength(1);
          expect(telemetry.failedActorSpans).toEqual([
            expect.objectContaining({ status: 'error' }),
          ]);
          expect(telemetry.retriedActorSpans).toEqual([
            expect.objectContaining({ status: 'ok' }),
          ]);
          expect(telemetry.causedBy).toEqual(
            expect.objectContaining({ kind: 'causedBy' }),
          );
          expect(telemetry.causedByPrior).toEqual(
            expect.objectContaining({ name: 'AccountBlockRepo.publish' }),
          );
          expect(telemetry.causedByCurrent).toEqual(
            expect.objectContaining({
              name: 'AccountBlockRepo.drainActorOutbox',
            }),
          );
          expect(telemetry.retryOf).toEqual(
            expect.objectContaining({ kind: 'retryOf' }),
          );
          expect(telemetry.retryOfPrior).toEqual(
            expect.objectContaining({
              name: 'AccountBlockRepo.processSubscriber',
            }),
          );
          expect(telemetry.retryOfCurrent).toEqual(
            expect.objectContaining({ name: 'AccountBlockRepo.alarm' }),
          );
        }).pipe(Effect.provide(AsyncLive)),
      120_000,
    );
  });
});
