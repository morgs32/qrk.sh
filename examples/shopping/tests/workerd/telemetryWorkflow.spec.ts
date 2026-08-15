/*
 * Shopping workerd annotation:
 * Proves that the public SystemApi finalization path persists its synchronous
 * trace, then links a failed frontend drain to the succeeding alarm retry.
 */

import { describe, it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { makeTestGateway } from '@zerospin/dev-worker/makeTestGateway';
import { makeWorkerdE2eTestLayer } from '@zerospin/dev-worker/vitest/makeWorkerdE2eTestLayer';
import { runDurableObjectAlarm } from 'cloudflare:test';
import { and, eq, isNull } from 'drizzle-orm';
import { Effect } from 'effect';
import { AggregateBlockRepo } from 'system-worker/AggregateBlockRepo/AggregateBlockRepo';
import { getAggregateBlockRepo } from 'system-worker/AggregateBlockRepo/getAggregateBlockRepo/getAggregateBlockRepo';
import { AggregateFrontendRepo } from 'system-worker/AggregateFrontendRepo/AggregateFrontendRepo';
import { getAggregateFrontendRepo } from 'system-worker/AggregateFrontendRepo/getAggregateFrontendRepo/getAggregateFrontendRepo';
import { managedRuntime } from 'system-worker/managedRuntime';
import { getSystemLogRepo } from 'system-worker/SystemLogRepo/getSystemLogRepo/getSystemLogRepo';
import { SystemLogRepo } from 'system-worker/SystemLogRepo/SystemLogRepo';
import { executeInRepo } from 'system-worker/workerd-utils/executeInRepo';
import { expect, vi } from 'vitest';

import { authenticationSignature } from '@/zerospin/authentication';
import { shopperFrontend } from '@/zerospin/frontend';
import { User } from '@/zerospin/models';
import { system } from '@/zerospin/system';

const shopperAggregate = system.aggregates.shopper;
const shopperAggregateFrontendLock =
  makeFrontendControllerSpec(shopperFrontend).aggregateFrontendLock;

const E2E_AGGREGATE_ID = makeAggregateId({ id: '1' });
const E2E_CLERK_USER_ID = 'user_telemetry';
const E2E_USER_ID = E2E_CLERK_USER_ID;
const TestLayer = makeWorkerdE2eTestLayer('telemetryWorkflow');

describe('public SystemApi telemetry persistence', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'stores request, failed drain, and successful alarm traces with causal links',
      () =>
        Effect.gen(function* () {
          const { gatewayApi, generationId } = yield* Effect.acquireRelease(
            makeAsync(makeTestGateway),
            opened => Effect.sync(() => opened.gatewayApi[Symbol.dispose]()),
          );
          const aggregateBlockRepo = yield* getAggregateBlockRepo({
            key: {
              generationId,
              aggregateId: E2E_AGGREGATE_ID,
              aggregateName: shopperFrontend.aggregateName,
            },
          });

          /*
           * 1. Create the aggregate and bootstrap the real AggregateFrontendRepo subscriber
           * before the measured workflow. This keeps the retry from creating a
           * new AggregateFrontendRepo, which would legitimately schedule another drain.
           */
          const systemApi = yield* makeAsync(() =>
            gatewayApi.getSystemApi({ zerospinSecretKey: 'sk_telemetry' }),
          );
          const createUserCommand = yield* shopperAggregate.makeCommand({
            contractName: 'createUser',
            aggregateId: E2E_AGGREGATE_ID,
            systemName: shopperFrontend.systemName,
            systemVersion: system.version,
            payload: {
              id: User.prefixId(E2E_CLERK_USER_ID),
              clerkUserId: E2E_CLERK_USER_ID,
            },
          });
          const encodedCreateUserCommand = {
            ...createUserCommand,
            payload: yield* shopperAggregate.contracts.createUser.encodePayload(
              { payload: createUserCommand.payload },
            ),
          };
          const setupBlock = yield* makeAsync(() =>
            systemApi.finalizeAggregateCommands({
              traceContext: null,
              args: [
                {
                  aggregateId: E2E_AGGREGATE_ID,
                  aggregateName: shopperFrontend.aggregateName,
                  commands: [encodedCreateUserCommand],
                },
              ],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          const authenticationLock = yield* makeAuthenticationLock({
            signature: authenticationSignature,
          });
          const authenticatedApi = yield* makeAsync(() =>
            gatewayApi.getAuthenticatedApi({
              publishableKey: 'pk_telemetry',
              authenticationLock,
              signature: { clerkUserId: E2E_CLERK_USER_ID },
            }),
          );
          yield* makeAsync(() => authenticatedApi.getAuthentication()).pipe(
            Effect.flatMap(decodeRpc),
          );
          const frontendApi = yield* makeAsync(() =>
            authenticatedApi.getAggregateFrontendApi({
              aggregateId: E2E_AGGREGATE_ID,
              aggregateName: shopperFrontend.aggregateName,
              frontendName: shopperFrontend.frontendName,
              aggregateFrontendLock: shopperAggregateFrontendLock,
            }),
          );
          yield* makeAsync(() => frontendApi.getAdmission()).pipe(
            Effect.flatMap(decodeRpc),
          );
          yield* makeAsync(() =>
            frontendApi.getState({
              traceContext: null,
              args: [],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));

          yield* Effect.promise(() =>
            vi.waitFor(
              async () => {
                const setupSubscriber = await executeInRepo({
                  managedRuntime,
                  getRepo: getAggregateBlockRepo,
                  repo: AggregateBlockRepo,
                  key: {
                    generationId,
                    aggregateId: E2E_AGGREGATE_ID,
                    aggregateName: shopperFrontend.aggregateName,
                  },
                  fn: ({ db, schema }) =>
                    db.select().from(schema.aggregateFrontendSubscribers).get(),
                });
                expect(setupSubscriber).toEqual(
                  expect.objectContaining({
                    currentAggregateCursor: setupBlock.lastAggregateCursor,
                    currentAggregateIndex: setupBlock.aggregateIndex,
                    queuedAggregateCursor: setupBlock.lastAggregateCursor,
                    queuedAggregateIndex: setupBlock.aggregateIndex,
                    lastDeliveryError: null,
                  }),
                );
              },
              { timeout: 10_000 },
            ),
          );
          yield* makeAsync(() =>
            aggregateBlockRepo.drainAggregateFrontendOutbox(),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope)));
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getSystemLogRepo,
              repo: SystemLogRepo,
              key: { generationId },
              fn: ({ db, schema }) => {
                db.delete(schema.telemetryLinks).run();
                db.delete(schema.telemetryLogs).run();
                db.delete(schema.telemetrySpans).run();
              },
            }),
          );

          /*
           * 2. Corrupt only the existing AggregateFrontendRepo cursor marker, then enter
           * through the actual public SystemApi. The first delivery returns a
           * real encoded domain error; the alarm retry runs after restoration.
           */
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateFrontendRepo,
              repo: AggregateFrontendRepo,
              key: {
                generationId,
                aggregateId: E2E_AGGREGATE_ID,
                aggregateName: shopperFrontend.aggregateName,
                userId: E2E_USER_ID,
                frontendName: shopperFrontend.frontendName,
              },
              fn: ({ state }) =>
                state.storage.kv.put(
                  'lastAggregateIndex',
                  'invalid-aggregate-index',
                ),
            }),
          );
          const updateUserCommand = yield* shopperAggregate.makeCommand({
            contractName: 'updateUser',
            aggregateId: E2E_AGGREGATE_ID,
            systemName: shopperFrontend.systemName,
            systemVersion: system.version,
            payload: {
              id: User.prefixId(E2E_CLERK_USER_ID),
              name: 'Telemetry Retry User',
            },
          });
          const encodedUpdateUserCommand = {
            ...updateUserCommand,
            payload: yield* shopperAggregate.contracts.updateUser.encodePayload(
              { payload: updateUserCommand.payload },
            ),
          };
          const finalizedBlock = yield* makeAsync(() =>
            systemApi.finalizeAggregateCommands({
              traceContext: null,
              args: [
                {
                  aggregateId: E2E_AGGREGATE_ID,
                  aggregateName: shopperFrontend.aggregateName,
                  commands: [encodedUpdateUserCommand],
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
           * 3. Wait for AggregateBlockRepo.publish's real waitUntil drain. The
           * durable subscriber failure proves that the first deferred trace
           * has finished without adding a second explicit drain invocation.
           */
          yield* Effect.promise(() =>
            vi.waitFor(
              async () => {
                const failedSubscriber = await executeInRepo({
                  managedRuntime,
                  getRepo: getAggregateBlockRepo,
                  repo: AggregateBlockRepo,
                  key: {
                    generationId,
                    aggregateId: E2E_AGGREGATE_ID,
                    aggregateName: shopperFrontend.aggregateName,
                  },
                  fn: ({ db, schema }) =>
                    db.select().from(schema.aggregateFrontendSubscribers).get(),
                });
                expect(failedSubscriber).toEqual(
                  expect.objectContaining({
                    currentAggregateCursor: setupBlock.lastAggregateCursor,
                    currentAggregateIndex: setupBlock.aggregateIndex,
                    queuedAggregateCursor: finalizedBlock.lastAggregateCursor,
                    queuedAggregateIndex: finalizedBlock.aggregateIndex,
                    lastDeliveryError: expect.any(String),
                  }),
                );
              },
              { timeout: 10_000 },
            ),
          );

          /*
           * 4. Repair the durable subscriber. The pending queue already scheduled
           * the actual Durable Object alarm, which must deliver the same block
           * successfully and persist an alarm root linked to the failed drain.
           */
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateFrontendRepo,
              repo: AggregateFrontendRepo,
              key: {
                generationId,
                aggregateId: E2E_AGGREGATE_ID,
                aggregateName: shopperFrontend.aggregateName,
                userId: E2E_USER_ID,
                frontendName: shopperFrontend.frontendName,
              },
              fn: ({ state }) =>
                state.storage.kv.put(
                  'lastAggregateIndex',
                  setupBlock.aggregateIndex,
                ),
            }),
          );
          const didRunAlarm = yield* Effect.promise(() =>
            runDurableObjectAlarm(aggregateBlockRepo),
          );
          expect(didRunAlarm).toBe(true);

          const deliveredSubscriber = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateBlockRepo,
              repo: AggregateBlockRepo,
              key: {
                generationId,
                aggregateId: E2E_AGGREGATE_ID,
                aggregateName: shopperFrontend.aggregateName,
              },
              fn: ({ db, schema }) =>
                db.select().from(schema.aggregateFrontendSubscribers).get(),
            }),
          );
          expect(deliveredSubscriber).toEqual(
            expect.objectContaining({
              currentAggregateCursor: finalizedBlock.lastAggregateCursor,
              currentAggregateIndex: finalizedBlock.aggregateIndex,
              queuedAggregateCursor: finalizedBlock.lastAggregateCursor,
              queuedAggregateIndex: finalizedBlock.aggregateIndex,
              lastDeliveryError: null,
            }),
          );

          /*
           * 5. Read the real SystemLogRepo tables and resolve each link endpoint back
           * to its stored span. This verifies the request/drain/retry DAG without
           * using an in-memory collector from the test process. The durable alarm
           * scheduler may also persist an empty alarm root while the queue is idle.
           */
          const telemetry = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getSystemLogRepo,
              repo: SystemLogRepo,
              key: { generationId },
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
                      'SystemRepo.finalizeAggregateCommands',
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
                        'AggregateBlockRepo.drainAggregateFrontendOutbox',
                      ),
                    ),
                  )
                  .get();
                const alarmRoots = db
                  .select()
                  .from(schema.telemetrySpans)
                  .where(
                    and(
                      isNull(schema.telemetrySpans.parentSpanId),
                      eq(
                        schema.telemetrySpans.name,
                        'AggregateBlockRepo.alarm',
                      ),
                    ),
                  )
                  .all();
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
                const aggregateRepoFinalizeSpans =
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
                              'AggregateRepo.finalizeAggregateBlock.rpc',
                            ),
                          ),
                        )
                        .all();
                const aggregateBlockPublishSpans =
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
                              'AggregateBlockRepo.publish',
                            ),
                          ),
                        )
                        .all();
                const failedFrontendSpans =
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
                              'AggregateFrontendRepo.handleAggregateBlocks',
                            ),
                          ),
                        )
                        .all();
                const retriedFrontendSpans = alarmRoots.flatMap(alarmRoot =>
                  db
                    .select()
                    .from(schema.telemetrySpans)
                    .where(
                      and(
                        eq(schema.telemetrySpans.traceId, alarmRoot.traceId),
                        eq(
                          schema.telemetrySpans.name,
                          'AggregateFrontendRepo.handleAggregateBlocks',
                        ),
                      ),
                    )
                    .all(),
                );
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
                  .all()
                  .find(link =>
                    alarmRoots.some(root => root.traceId === link.traceId),
                  );
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
                  aggregateRepoFinalizeSpans,
                  aggregateBlockPublishSpans,
                  failedFrontendSpans,
                  retriedFrontendSpans,
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

          expect(telemetry.roots.map(root => root.name)).toEqual(
            expect.arrayContaining([
              'AggregateBlockRepo.alarm',
              'AggregateBlockRepo.drainAggregateFrontendOutbox',
              'SystemRepo.finalizeAggregateCommands',
            ]),
          );
          expect(
            telemetry.roots.filter(
              root => root.name === 'SystemRepo.finalizeAggregateCommands',
            ),
          ).toHaveLength(1);
          expect(
            telemetry.roots.filter(
              root =>
                root.name === 'AggregateBlockRepo.drainAggregateFrontendOutbox',
            ),
          ).toHaveLength(1);
          expect(
            telemetry.roots.filter(
              root => root.name === 'AggregateBlockRepo.alarm',
            ).length,
          ).toBeGreaterThanOrEqual(1);
          expect(telemetry.roots).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                name: 'SystemRepo.finalizeAggregateCommands',
                status: 'ok',
              }),
              expect.objectContaining({
                name: 'AggregateBlockRepo.drainAggregateFrontendOutbox',
                status: 'ok',
              }),
              expect.objectContaining({
                name: 'AggregateBlockRepo.alarm',
                status: 'ok',
              }),
            ]),
          );
          expect(telemetry.requestSpans).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                name: 'SystemRepo.finalizeAggregateCommands',
              }),
              expect.objectContaining({
                name: 'AggregateRepo.finalizeAggregateBlock.rpc',
              }),
              expect.objectContaining({
                name: 'AggregateBlockRepo.publish',
              }),
            ]),
          );
          expect(telemetry.aggregateRepoFinalizeSpans).toHaveLength(1);
          expect(telemetry.aggregateBlockPublishSpans).toHaveLength(1);
          expect(telemetry.failedFrontendSpans.length).toBeGreaterThanOrEqual(
            1,
          );
          expect(
            telemetry.failedFrontendSpans.every(
              span => span.status === 'error',
            ),
          ).toBe(true);
          expect(
            telemetry.retriedFrontendSpans.some(span => span.status === 'ok'),
          ).toBe(true);
          expect(telemetry.causedBy).toEqual(
            expect.objectContaining({ kind: 'causedBy' }),
          );
          expect(telemetry.causedByPrior).toEqual(
            expect.objectContaining({ name: 'AggregateBlockRepo.publish' }),
          );
          expect(telemetry.causedByCurrent).toEqual(
            expect.objectContaining({
              name: 'AggregateBlockRepo.drainAggregateFrontendOutbox',
            }),
          );
          expect(telemetry.retryOf).toEqual(
            expect.objectContaining({ kind: 'retryOf' }),
          );
          expect(telemetry.retryOfPrior).toEqual(
            expect.objectContaining({
              name: 'DeliveryQueue.deliverAttempt',
            }),
          );
          expect(telemetry.retryOfCurrent).toEqual(
            expect.objectContaining({
              name: 'DeliveryQueue.attachAlarmRetryLinks',
            }),
          );
        }).pipe(Effect.provide(AsyncLive), Effect.scoped),
      120_000,
    );
  });
});
