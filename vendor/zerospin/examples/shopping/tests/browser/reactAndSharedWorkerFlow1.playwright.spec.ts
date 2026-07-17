import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type { InferIdFromAbbreviation } from '@zerospin/core/models/types';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { SignatureFactory } from '@zerospin/core/services/SignatureFactory';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { makeSession } from '@zerospin/core/session/makeSession';
import {
  sessionExecutedPushedCommandDrizzleSchema,
  sessionPushedCommandDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from '@zerospin/core/session/sessionCommandShape';
import type { IFrontendState } from '@zerospin/core/session/types';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ErrorLayer } from '@zerospin/core/utils/ErrorLayer';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import type { ISignatureFactory } from '@zerospin/core/utils/types';
import { makeTelemetryLayer } from '@zerospin/logger';
import { bootstrapBrowserSession } from '@zerospin/react/bootstrapBrowserSession';
import { makeBrowserUserController } from '@zerospin/react/makeBrowserUserController';
import { Effect, Layer, Redacted } from 'effect';
/**
 * Browser Vitest spec (Chromium + browser session bootstrap + IndexedDB-backed SharedWorker user DB).
 * Runs via vitest.playwright.config.ts.
 */
import { describe, expect, it, vi } from 'vitest';

import { shopperFrontend } from '@/zerospin/frontend';
import { Cart, CartItem, Product } from '@/zerospin/models';

const testRunId = vi.hoisted(
  () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
);
const testActorId = vi.hoisted(() => ({
  clerkUserId: `react_shared_worker_flow_${testRunId}`,
  userId:
    `usr_react_shared_worker_flow_${testRunId}` as InferIdFromAbbreviation<'usr'>,
  actorId:
    `actr_react_shared_worker_flow_${testRunId}` as InferIdFromAbbreviation<'actr'>,
}));
const productId1 = vi.hoisted(
  () => 'prd_flow_1' as InferIdFromAbbreviation<'prd'>,
);
const _productId2 = vi.hoisted(
  () => 'prd_flow_2' as InferIdFromAbbreviation<'prd'>,
);
const SYSTEM_WORKER_NAME = vi.hoisted(() => 'happy_blue_whale_ab');
const seedNow = vi.hoisted(() => new Date('2026-01-01T00:00:00.000Z'));
const product1 = {
  id: productId1,
  modelName: Product.modelName,
  version: Product.version,
  createdAt: seedNow,
  updatedAt: seedNow,
  description: 'Flow product',
  name: 'Flow product',
  price: 100,
};

const seedControllerState = vi.hoisted(
  (): IFrontendState => ({
    actorId: testActorId.actorId,
    systemWorkerName: SYSTEM_WORKER_NAME,
    accountName: 'user',
    actorName: 'shopper',
    frontendName: 'web',
    frontendIndex: null,
    lastRebasedPushedCursor: null,
    resources: [
      {
        id: testActorId.userId,
        actorId: testActorId.actorId,
        modelName: 'user',
        pushedCursor: null,
        createdAt: seedNow,
        updatedAt: seedNow,
        version: '1.0.0',
        name: null,
      },
    ],
    pushedCommands: [],
    executedPushedCommands: [],
    failedPushedCommands: [],
  }),
);

vi.mock('@zerospin/frontend/fetchActor', async () => {
  const { Effect } = await import('effect');
  return {
    fetchActor: Effect.fn('fetchActor')(function* () {
      yield* Effect.void;
      return {
        actor: {
          accountId: 'acct_1',
          actorId: testActorId.actorId,
        },
        systemWorkerName: SYSTEM_WORKER_NAME,
        systemEnvironmentId: 'dev' as const,
      };
    }),
  };
});

vi.mock('@zerospin/frontend/fetchFrontendState', async () => {
  const { Effect } = await import('effect');
  return {
    fetchFrontendState: Effect.fn('fetchFrontendState')(function* () {
      yield* Effect.void;
      return seedControllerState;
    }),
  };
});

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('reactAndSharedWorkerFlow1'),
  IncrementalMonotonicFactory,
  ErrorLayer,
  Layer.succeed(ZerospinApisUrl, 'https://api.example.com/'),
  Layer.succeed(PublishableKey, Redacted.make('pk_test')),
  Layer.succeed(SignatureFactory, () =>
    Effect.succeed({ clerkUserId: testActorId.clerkUserId }),
  ),
);

const generateSignature: ISignatureFactory = () =>
  Effect.succeed({ clerkUserId: testActorId.clerkUserId });

describe('reactAndSharedWorkerFlow1', () => {
  it('bootstraps two SharedWorker sessions for the same user while both ports stay alive', async () => {
    const releaseEffects = await Effect.runPromise(
      Effect.gen(function* () {
        const sessionId1 = yield* makeIdFromAbbreviation({
          abbreviation: 'sesn',
        });
        const sessionId2 = yield* makeIdFromAbbreviation({
          abbreviation: 'sesn',
        });
        const session1 = makeSession({
          frontend: shopperFrontend,
          sessionId: sessionId1,
        });
        const session2 = makeSession({
          frontend: shopperFrontend,
          sessionId: sessionId2,
        });
        const controller1 = makeBrowserUserController(testActorId.clerkUserId);
        const controller2 = makeBrowserUserController(testActorId.clerkUserId);

        const bootstrap1 = bootstrapBrowserSession({
          session: session1,
          browserUserController: controller1,
          generateSignature,
        }).pipe(
          Effect.provideService(SignatureFactory, generateSignature),
          Effect.provide(
            makeTelemetryLayer(
              session1.store.getState().telemetryCollector,
            ),
          ),
          Effect.provide(TestLayer),
          Effect.provide(AsyncLive),
        );
        const bootstrap2 = bootstrapBrowserSession({
          session: session2,
          browserUserController: controller2,
          generateSignature,
        }).pipe(
          Effect.provideService(SignatureFactory, generateSignature),
          Effect.provide(
            makeTelemetryLayer(
              session2.store.getState().telemetryCollector,
            ),
          ),
          Effect.provide(TestLayer),
          Effect.provide(AsyncLive),
        );

        const [bootstrapResult1, bootstrapResult2] = yield* Effect.all(
          [bootstrap1, bootstrap2],
          { concurrency: 2 },
        );

        expect(session1.store.getState().isInitialized).toBe(true);
        expect(session2.store.getState().isInitialized).toBe(true);
        expect(bootstrapResult1.actor.actorId).toBe(testActorId.actorId);
        expect(bootstrapResult2.actor.actorId).toBe(testActorId.actorId);

        return {
          release1: bootstrapResult1.releaseBrowserSession,
          release2: bootstrapResult2.releaseBrowserSession,
        };
      }).pipe(Effect.provide(TestLayer), Effect.provide(AsyncLive)),
    );

    await Effect.runPromise(releaseEffects.release1);
    await Effect.runPromise(releaseEffects.release2);
  }, 120_000);

  it('bootstrap, stage, and refresh keep session state in sync', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sessionId1 = yield* makeIdFromAbbreviation({
          abbreviation: 'sesn',
        });
        const session1 = makeSession({
          frontend: shopperFrontend,
          sessionId: sessionId1,
        });

        const { db: db1, actor } = yield* bootstrapBrowserSession({
          session: session1,
          browserUserController: makeBrowserUserController(
            testActorId.clerkUserId,
          ),
          generateSignature,
        }).pipe(
          Effect.provideService(SignatureFactory, generateSignature),
          Effect.provide(
            makeTelemetryLayer(
              session1.store.getState().telemetryCollector,
            ),
          ),
        );

        const actorId = actor.actorId;

        const store1 = session1.store.getState();
        if (!store1.isInitialized) {
          return yield* Effect.fail(
            new Error('session1 should be initialized'),
          );
        }
        if (actorId !== testActorId.actorId) {
          return yield* Effect.fail(new Error('unexpected actorId'));
        }

        const cartId = yield* makeIdFromAbbreviation({
          abbreviation: Cart.abbreviation,
        });
        const cartItemId = yield* makeIdFromAbbreviation({
          abbreviation: CartItem.abbreviation,
        });

        const createCartStaged = yield* Effect.promise(() =>
          session1.stageCommand({
            contractName: 'createCart',
            payload: { id: cartId, userId: testActorId.userId },
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const addToCartStaged = yield* Effect.promise(() =>
          session1.stageCommand({
            contractName: 'addToCart',
            payload: {
              id: cartItemId,
              cartId,
              product: product1,
              quantity: 1,
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const cartCommandIds = [createCartStaged.id, addToCartStaged.id];

        const stagedRowsAfterStage = db1
          .select()
          .from(sessionStagedCommandDrizzleSchema)
          .all();
        const pushedRowsAfterStage = db1
          .select()
          .from(sessionPushedCommandDrizzleSchema)
          .all();
        const executedRowsAfterStage = db1
          .select()
          .from(sessionExecutedPushedCommandDrizzleSchema)
          .all();

        for (const commandId of cartCommandIds) {
          expect(stagedRowsAfterStage.map(row => row.id)).toContain(commandId);
          expect(pushedRowsAfterStage.map(row => row.id)).not.toContain(
            commandId,
          );
          expect(executedRowsAfterStage.map(row => row.id)).not.toContain(
            commandId,
          );
        }

        const stagedRowsAfterRefresh = db1
          .select()
          .from(sessionStagedCommandDrizzleSchema)
          .all();
        const pushedRowsAfterRefresh = db1
          .select()
          .from(sessionPushedCommandDrizzleSchema)
          .all();
        const executedRowsAfterRefresh = db1
          .select()
          .from(sessionExecutedPushedCommandDrizzleSchema)
          .all();

        for (const commandId of cartCommandIds) {
          expect(stagedRowsAfterRefresh.map(row => row.id)).toContain(
            commandId,
          );
          expect(pushedRowsAfterRefresh.map(row => row.id)).not.toContain(
            commandId,
          );
          expect(executedRowsAfterRefresh.map(row => row.id)).not.toContain(
            commandId,
          );
        }
      }).pipe(Effect.provide(TestLayer), Effect.provide(AsyncLive)),
    );
  }, 120_000);
});
