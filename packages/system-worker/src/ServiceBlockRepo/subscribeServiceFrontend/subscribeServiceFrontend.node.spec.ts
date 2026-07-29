import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemorySqljsDb } from '@zerospin/core/drizzle/makeMigratedInMemorySqljsDb';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type { IAnyTables } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { ZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { beforeEach, describe, expect, vi } from 'vitest';

import { ServiceBlockSchema } from '../../blockSchemas.js';
import type { IServiceBlock } from '../../types.js';
import { drainServiceFrontendSubscribers } from '../drainServiceFrontendSubscribers/drainServiceFrontendSubscribers.js';
import { publish } from '../publish/publish.js';
import { serviceBlockDrizzleSchemas } from '../ServiceBlockRepo.js';

import { subscribeServiceFrontend } from './subscribeServiceFrontend.js';

const { getServiceFrontendRepoByName, handleServiceBlocks } = vi.hoisted(() => {
  const handleServiceBlocks = vi.fn();
  return {
    handleServiceBlocks,
    getServiceFrontendRepoByName: vi.fn(() => ({ handleServiceBlocks })),
  };
});

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {},
  WorkerEntrypoint: class {},
  env: {
    SERVICE_FRONTEND_REPO: {
      getByName: getServiceFrontendRepoByName,
    },
  },
}));

vi.mock('../ServiceBlockRepo.js', async () => {
  const { makeDbConfig } = await import('@zerospin/core/drizzle/makeDbConfig');
  const { makeTable } = await import('@zerospin/core/models/makeTable');
  const { primitives } = await import('@zerospin/core/models/primitives');
  const { coreAbbreviations } =
    await import('@zerospin/core/utils/coreAbbreviations');
  const { ServiceBlockSchema } = await import('../../blockSchemas.js');
  return {
    serviceBlockDrizzleSchemas: makeDbConfig({
      tables: {
        serviceBlocks: makeTable({
          name: 'serviceBlocks',
          shape: {
            lastServiceCursor: primitives.primaryKey({
              abbreviation: coreAbbreviations.serviceCursor,
            }),
            serviceIndex: primitives.integer({ unique: true }),
            block: primitives.json({ schema: ServiceBlockSchema }),
          },
        }),
        serviceFrontendSubscribers: makeTable({
          name: 'serviceFrontendSubscribers',
          shape: {
            serviceFrontendRepoName: primitives.primaryKey({
              abbreviation: 'svcfrtrepo',
            }),
            serviceName: primitives.text(),
            actorName: primitives.text(),
            actorId: primitives.opaqueId({
              abbreviation: coreAbbreviations.actor,
            }),
            frontendName: primitives.text(),
            currentServiceCursor: primitives.cursor({
              abbreviation: coreAbbreviations.serviceCursor,
              nullable: true,
            }),
            currentServiceIndex: primitives.integer({ nullable: true }),
            catchupThroughServiceCursor: primitives.cursor({
              abbreviation: coreAbbreviations.serviceCursor,
              nullable: true,
            }),
            catchupThroughServiceIndex: primitives.integer({ nullable: true }),
            status: primitives.enum({ values: ['catching-up', 'live'] }),
            lastDeliveryError: primitives.text({ nullable: true }),
          },
        }),
      },
    }).schema,
  };
});

vi.mock('@zerospin/core/utils/defaultRetrySchedule', async () => {
  const { Schedule } = await import('effect');
  return { defaultRetrySchedule: Schedule.recurs(0) };
});

const serviceBlockTestDbConfig = makeDbConfig({
  tables: {
    serviceBlocks: makeTable({
      name: 'serviceBlocks',
      shape: {
        lastServiceCursor: primitives.primaryKey({
          abbreviation: coreAbbreviations.serviceCursor,
        }),
        serviceIndex: primitives.integer({ unique: true }),
        block: primitives.json({ schema: ServiceBlockSchema }),
      },
    }),
    serviceFrontendSubscribers: makeTable({
      name: 'serviceFrontendSubscribers',
      shape: {
        serviceFrontendRepoName: primitives.primaryKey({
          abbreviation: 'svcfrtrepo',
        }),
        serviceName: primitives.text(),
        actorName: primitives.text(),
        actorId: primitives.opaqueId({
          abbreviation: coreAbbreviations.actor,
        }),
        frontendName: primitives.text(),
        currentServiceCursor: primitives.cursor({
          abbreviation: coreAbbreviations.serviceCursor,
          nullable: true,
        }),
        currentServiceIndex: primitives.integer({ nullable: true }),
        catchupThroughServiceCursor: primitives.cursor({
          abbreviation: coreAbbreviations.serviceCursor,
          nullable: true,
        }),
        catchupThroughServiceIndex: primitives.integer({ nullable: true }),
        status: primitives.enum({ values: ['catching-up', 'live'] }),
        lastDeliveryError: primitives.text({ nullable: true }),
      },
    }),
  } satisfies IAnyTables,
});

describe('ServiceBlockRepo.subscribeServiceFrontend', () => {
  beforeEach(() => {
    getServiceFrontendRepoByName.mockClear();
    handleServiceBlocks.mockReset();
  });

  it.effect(
    'retains the failed N-to-T catch-up and retries that exact contiguous suffix once',
    () =>
      Effect.gen(function* () {
        const db = yield* makeMigratedInMemorySqljsDb({
          dbConfig: serviceBlockTestDbConfig,
        });
        const blockAtSnapshot: IServiceBlock = {
          executedCommands: [],
          failedCommands: [],
          appliedMutations: [],
          lastServiceCursor: 'svcur_service_frontend_snapshot',
          serviceIndex: 1,
        };
        const blockAfterSnapshot: IServiceBlock = {
          executedCommands: [],
          failedCommands: [],
          appliedMutations: [],
          lastServiceCursor: 'svcur_service_frontend_after_snapshot',
          serviceIndex: 2,
        };
        const blockAtCapturedTerminal: IServiceBlock = {
          executedCommands: [],
          failedCommands: [],
          appliedMutations: [],
          lastServiceCursor: 'svcur_service_frontend_terminal',
          serviceIndex: 3,
        };
        const blockPublishedAfterFailure: IServiceBlock = {
          executedCommands: [],
          failedCommands: [],
          appliedMutations: [],
          lastServiceCursor: 'svcur_service_frontend_after_failure',
          serviceIndex: 4,
        };

        // 1. Snapshot N exists before two later service mutations reach the
        //    durable ServiceBlockRepo archive. Subscription must capture T=3.
        yield* publish({ block: blockAtSnapshot, db });
        const snapshotCursor = blockAtSnapshot.lastServiceCursor;
        const snapshotIndex = blockAtSnapshot.serviceIndex;
        yield* publish({ block: blockAfterSnapshot, db });
        yield* publish({ block: blockAtCapturedTerminal, db });

        // 2. A terminal catch-up failure leaves the subscriber pinned at N
        //    with its immutable T and does not claim the subscriber is live.
        handleServiceBlocks.mockResolvedValue(
          encodeLeft(
            new ZerospinError({
              code: 'service-frontend-catchup-injected-failure',
              message: 'Injected service frontend catch-up failure',
            }),
          ),
        );
        const failed = yield* subscribeServiceFrontend({
          serviceFrontendRepoName:
            'svcfrtrepo_gen_test/catalog/shopper/actr_test/products',
          serviceName: 'catalog',
          actorName: 'shopper',
          actorId: 'actr_test',
          frontendName: 'products',
          currentServiceCursor: snapshotCursor,
          currentServiceIndex: snapshotIndex,
          db,
          key: { generationId: 'gen_test', serviceName: 'catalog' },
        }).pipe(Effect.either);
        expect(failed._tag).toBe('Left');
        if (failed._tag === 'Left') {
          expect(failed.left.code).toBe(
            'service-frontend-catchup-injected-failure',
          );
        }
        expect(handleServiceBlocks).toHaveBeenCalledTimes(1);

        const retainedCatchup = db
          .select()
          .from(serviceBlockDrizzleSchemas.serviceFrontendSubscribers)
          .where(
            eq(
              serviceBlockDrizzleSchemas.serviceFrontendSubscribers
                .serviceFrontendRepoName,
              'svcfrtrepo_gen_test/catalog/shopper/actr_test/products',
            ),
          )
          .get();
        expect(retainedCatchup).toMatchObject({
          currentServiceCursor: snapshotCursor,
          currentServiceIndex: snapshotIndex,
          catchupThroughServiceCursor:
            blockAtCapturedTerminal.lastServiceCursor,
          catchupThroughServiceIndex: blockAtCapturedTerminal.serviceIndex,
          status: 'catching-up',
          lastDeliveryError:
            'service-frontend-catchup-injected-failure: Injected service frontend catch-up failure',
        });

        // 3. An ordinary queue drain must return a future deadline after its
        //    bounded retries fail so the shared account/service alarm owner
        //    cannot mistake this durable catch-up work for an idle queue.
        const beforeRetryDeadline = Date.now();
        const retryDeadline = yield* drainServiceFrontendSubscribers({
          db,
          key: { generationId: 'gen_test', serviceName: 'catalog' },
          onlyServiceFrontendRepoName: null,
          failFast: false,
        });
        expect(retryDeadline).not.toBeNull();
        expect(retryDeadline).toBeGreaterThanOrEqual(beforeRetryDeadline + 250);

        // 4. A publish after the failed attempt stays outside the immutable
        //    catch-up bound T. It is buffered for the later live drain.
        yield* publish({ block: blockPublishedAfterFailure, db });

        // 5. The caller retries from the same deterministic snapshot. The
        //    target receives exactly N+1 and N+2 once, in ascending order.
        handleServiceBlocks.mockReset();
        handleServiceBlocks.mockResolvedValue(encodeRight(undefined));
        const retried = yield* subscribeServiceFrontend({
          serviceFrontendRepoName:
            'svcfrtrepo_gen_test/catalog/shopper/actr_test/products',
          serviceName: 'catalog',
          actorName: 'shopper',
          actorId: 'actr_test',
          frontendName: 'products',
          currentServiceCursor: snapshotCursor,
          currentServiceIndex: snapshotIndex,
          db,
          key: { generationId: 'gen_test', serviceName: 'catalog' },
        });
        expect(retried).toEqual({
          throughServiceCursor: blockAtCapturedTerminal.lastServiceCursor,
          throughServiceIndex: blockAtCapturedTerminal.serviceIndex,
        });
        expect(getServiceFrontendRepoByName).toHaveBeenLastCalledWith(
          'svcfrtrepo_gen_test/catalog/shopper/actr_test/products',
        );
        expect(handleServiceBlocks).toHaveBeenCalledTimes(1);
        const delivered = handleServiceBlocks.mock.calls[0]?.[0];
        expect(delivered?.serviceName).toBe('catalog');
        expect(delivered?.blocks).toHaveLength(2);
        expect(delivered?.blocks[0]).toEqual(blockAfterSnapshot);
        expect(delivered?.blocks[1]).toEqual(blockAtCapturedTerminal);

        const liveSubscriber = db
          .select()
          .from(serviceBlockDrizzleSchemas.serviceFrontendSubscribers)
          .where(
            eq(
              serviceBlockDrizzleSchemas.serviceFrontendSubscribers
                .serviceFrontendRepoName,
              'svcfrtrepo_gen_test/catalog/shopper/actr_test/products',
            ),
          )
          .get();
        expect(liveSubscriber).toMatchObject({
          currentServiceCursor: blockAtCapturedTerminal.lastServiceCursor,
          currentServiceIndex: blockAtCapturedTerminal.serviceIndex,
          catchupThroughServiceCursor: null,
          catchupThroughServiceIndex: null,
          status: 'live',
          lastDeliveryError: null,
        });

        // 6. Once live, an ordinary drain delivers the post-failure block as
        //    a separate suffix instead of silently extending the retry.
        handleServiceBlocks.mockReset();
        handleServiceBlocks.mockResolvedValue(encodeRight(undefined));
        const liveRetryDeadline = yield* drainServiceFrontendSubscribers({
          db,
          key: { generationId: 'gen_test', serviceName: 'catalog' },
          onlyServiceFrontendRepoName: null,
          failFast: false,
        });
        expect(liveRetryDeadline).toBeNull();
        expect(handleServiceBlocks).toHaveBeenCalledTimes(1);
        const liveDelivery = handleServiceBlocks.mock.calls[0]?.[0];
        expect(liveDelivery?.blocks).toHaveLength(1);
        expect(liveDelivery?.blocks[0]).toEqual(blockPublishedAfterFailure);

        const advancedLiveSubscriber = db
          .select()
          .from(serviceBlockDrizzleSchemas.serviceFrontendSubscribers)
          .where(
            eq(
              serviceBlockDrizzleSchemas.serviceFrontendSubscribers
                .serviceFrontendRepoName,
              'svcfrtrepo_gen_test/catalog/shopper/actr_test/products',
            ),
          )
          .get();
        expect(advancedLiveSubscriber).toMatchObject({
          currentServiceCursor: blockPublishedAfterFailure.lastServiceCursor,
          currentServiceIndex: blockPublishedAfterFailure.serviceIndex,
          status: 'live',
          lastDeliveryError: null,
        });
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'keeps the newer watermark when an older delivery fails after it',
    () =>
      Effect.gen(function* () {
        const db = yield* makeMigratedInMemorySqljsDb({
          dbConfig: serviceBlockTestDbConfig,
        });
        const firstBlock: IServiceBlock = {
          executedCommands: [],
          failedCommands: [],
          appliedMutations: [],
          lastServiceCursor: 'svcur_service_frontend_concurrent_1',
          serviceIndex: 1,
        };
        const secondBlock: IServiceBlock = {
          executedCommands: [],
          failedCommands: [],
          appliedMutations: [],
          lastServiceCursor: 'svcur_service_frontend_concurrent_2',
          serviceIndex: 2,
        };
        yield* publish({ block: firstBlock, db });
        db.insert(serviceBlockDrizzleSchemas.serviceFrontendSubscribers)
          .values({
            serviceFrontendRepoName:
              'svcfrtrepo_gen_test/catalog/shopper/actr_test/products',
            serviceName: 'catalog',
            actorName: 'shopper',
            actorId: 'actr_test',
            frontendName: 'products',
            currentServiceCursor: null,
            currentServiceIndex: null,
            catchupThroughServiceCursor: null,
            catchupThroughServiceIndex: null,
            status: 'live',
            lastDeliveryError: null,
          })
          .run();

        let announceFirstDeliveryStarted = () => undefined;
        const firstDeliveryStarted = new Promise<void>(resolve => {
          announceFirstDeliveryStarted = resolve;
        });
        let releaseFirstDelivery = () => undefined;
        const firstDeliveryGate = new Promise<void>(resolve => {
          releaseFirstDelivery = resolve;
        });
        handleServiceBlocks.mockImplementationOnce(async () => {
          announceFirstDeliveryStarted();
          await firstDeliveryGate;
          return encodeLeft(
            new ZerospinError({
              code: 'service-frontend-concurrent-old-failure',
              message: 'Injected older delivery failure',
            }),
          );
        });
        handleServiceBlocks.mockResolvedValue(encodeRight(undefined));

        const olderDrain = Effect.runPromise(
          drainServiceFrontendSubscribers({
            db,
            key: { generationId: 'gen_test', serviceName: 'catalog' },
            onlyServiceFrontendRepoName: null,
            failFast: false,
          }).pipe(Effect.provide(AsyncLive)),
        );
        yield* Effect.promise(() => firstDeliveryStarted);

        yield* publish({ block: secondBlock, db });
        const newerRetryDeadline = yield* drainServiceFrontendSubscribers({
          db,
          key: { generationId: 'gen_test', serviceName: 'catalog' },
          onlyServiceFrontendRepoName: null,
          failFast: false,
        });
        releaseFirstDelivery();
        const olderRetryDeadline = yield* Effect.promise(() => olderDrain);

        expect(newerRetryDeadline).toBeNull();
        expect(olderRetryDeadline).toBeNull();
        expect(
          db
            .select()
            .from(serviceBlockDrizzleSchemas.serviceFrontendSubscribers)
            .where(
              eq(
                serviceBlockDrizzleSchemas.serviceFrontendSubscribers
                  .serviceFrontendRepoName,
                'svcfrtrepo_gen_test/catalog/shopper/actr_test/products',
              ),
            )
            .get(),
        ).toMatchObject({
          currentServiceCursor: secondBlock.lastServiceCursor,
          currentServiceIndex: secondBlock.serviceIndex,
          status: 'live',
          lastDeliveryError: null,
        });
      }).pipe(Effect.provide(AsyncLive)),
  );
});
