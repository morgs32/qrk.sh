/* oxlint-disable react/no-children-prop -- This exact .ts acceptance filename cannot contain JSX. */
import { act, createElement, useEffect } from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import {
  sessionExecutedPushedCommandDrizzleSchema,
  sessionFailedCommandDrizzleSchema,
  sessionPushedCommandDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from '@zerospin/core/session/sessionCommandShape';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { makeZerospinApp } from '@zerospin/react/makeZerospinApp';
import type {
  IBrowserServiceSession,
  IBrowserSession,
} from '@zerospin/react/types';
import { useSession } from '@zerospin/react/useSession';
import { newWebSocketRpcSession } from 'capnweb';
import { eq } from 'drizzle-orm';
import { Effect, Layer, ManagedRuntime, Redacted, Schema } from 'effect';
import { createRoot } from 'react-dom/client';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { afterAll, describe, expect, it } from 'vitest';

import { authenticationSignature } from '@/zerospin/authentication';
import { catalogFrontend, shopperFrontend } from '@/zerospin/frontend';
import { ClerkUserIdSchema, User } from '@/zerospin/models';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});

const testRunId = `${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2)}`;
const clerkUserId = Schema.decodeUnknownSync(ClerkUserIdSchema)(
  `browser-aggregate-${testRunId}`,
);

const testRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    AsyncLive,
    makePrefixedIncrementalIdFactory('reactAndSharedWorkerFlow1'),
    IncrementalMonotonicFactory,
    Layer.succeed(ZerospinApiUrl, 'http://127.0.0.1:3035/'),
    Layer.succeed(PublishableKey, Redacted.make('pk_test')),
  ),
);

const FlowZerospinApp = makeZerospinApp({
  systemName: 'shopping',
  authentication: { signature: authenticationSignature },
  frontends: {
    web: {
      controller: shopperFrontend,
      contracts: { updateCartItemQuantity: '1.0.0' },
    },
    catalog: { controller: catalogFrontend },
  },
  runtime: testRuntime,
});

function FlowSessionsProbe(props: {
  onSessions(
    aggregateSession: IBrowserSession<
      typeof FlowZerospinApp.frontends.web.frontend
    >,
    serviceSession: IBrowserServiceSession<typeof catalogFrontend>,
  ): void;
}) {
  const aggregateSession = useSession(FlowZerospinApp.frontends.web);
  const serviceSession = useSession(FlowZerospinApp.frontends.catalog);
  const { onSessions } = props;

  useEffect(() => {
    onSessions(aggregateSession, serviceSession);
  }, [aggregateSession, onSessions, serviceSession]);

  return null;
}

afterAll(async () => {
  await testRuntime.dispose();
});

describe('reactAndSharedWorkerFlow1', () => {
  it('runs one page-owned aggregate and service session through worker-owned capabilities', async () => {
    await expect
      .poll(
        async () => {
          try {
            using gatewayApi = newWebSocketRpcSession<GatewayApi>(
              'ws://127.0.0.1:3035/',
            );
            using devDeployApi = await gatewayApi.getDevDeployApi();
            await Effect.runPromise(
              decodeRpc(await devDeployApi.getReadiness()),
            );
            return true;
          } catch {
            return false;
          }
        },
        { interval: 500, timeout: 120_000 },
      )
      .toBe(true);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const sessions: {
      aggregate: IBrowserSession<
        typeof FlowZerospinApp.frontends.web.frontend
      > | null;
      service: IBrowserServiceSession<typeof catalogFrontend> | null;
    } = { aggregate: null, service: null };
    let signatureCallCount = 0;
    const legacyLocatorKey = `zerospin:user-locator:${JSON.stringify([
      'shopping',
      clerkUserId,
    ])}`;
    globalThis.localStorage.setItem(legacyLocatorKey, 'sys_legacy_ignored');

    try {
      await act(async () => {
        root.render(
          createElement(FlowZerospinApp.Provider, {
            aggregateIds: { shopper: 'acct_1' },
            generateSignature: () => {
              signatureCallCount += 1;
              return Effect.succeed({ clerkUserId });
            },
            children: createElement(FlowSessionsProbe, {
              onSessions: (aggregateSession, serviceSession) => {
                sessions.aggregate = aggregateSession;
                sessions.service = serviceSession;
              },
            }),
          }),
        );
        await Promise.resolve();
      });

      await expect
        .poll(
          () => sessions.aggregate?.store.getState().isInitialized ?? false,
          { interval: 100, timeout: 30_000 },
        )
        .toBe(true);
      await expect
        .poll(() => sessions.service?.store.getState().isInitialized ?? false, {
          interval: 100,
          timeout: 120_000,
        })
        .toBe(true);

      const aggregateSession = sessions.aggregate;
      const serviceSession = sessions.service;
      if (aggregateSession === null || serviceSession === null) {
        throw new Error('Both browser sessions must initialize');
      }

      const aggregateState = aggregateSession.store.getState();
      const serviceState = serviceSession.store.getState();
      if (!aggregateState.isInitialized || !serviceState.isInitialized) {
        throw new Error('Both browser session stores must initialize');
      }
      expect(aggregateState.workerState).toMatchObject({
        bootstrapSource: 'replica',
        mode: 'shared-worker',
        status: 'online',
      });
      expect(serviceState.workerState).toMatchObject({
        bootstrapSource: 'replica',
        mode: 'shared-worker',
        status: 'online',
      });
      expect(signatureCallCount).toBe(1);
      expect(aggregateState.db).not.toBe(serviceState.db);

      const diagnosticRoots = Array.from(
        zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
      ).filter(diagnosticRoot => diagnosticRoot.userId === clerkUserId);
      expect(diagnosticRoots).toHaveLength(1);
      const diagnosticRoot = diagnosticRoots[0];
      if (diagnosticRoot === undefined) {
        throw new Error('Expected one user-bound SharedWorker diagnostic root');
      }
      expect(diagnosticRoot.mode).toBe('online');
      expect(diagnosticRoot.systemId).not.toBe('sys_legacy_ignored');
      await expect
        .poll(
          async () => {
            const aggregateRows = await Effect.runPromise(
              decodeRpc(await diagnosticRoot.listAggregateFrontendReplicas()),
            );
            const serviceRows = await Effect.runPromise(
              decodeRpc(await diagnosticRoot.listServiceFrontendReplicas()),
            );
            return {
              aggregateCount: aggregateRows.length,
              aggregateRegistrations: aggregateRows[0]?.activeRegistrationCount,
              aggregateSocket: aggregateRows[0]?.socketState,
              serviceCount: serviceRows.length,
              serviceRegistrations: serviceRows[0]?.activeRegistrationCount,
              serviceSocket: serviceRows[0]?.socketState,
            };
          },
          { interval: 100, timeout: 30_000 },
        )
        .toEqual({
          aggregateCount: 1,
          aggregateRegistrations: 1,
          aggregateSocket: 'online',
          serviceCount: 1,
          serviceRegistrations: 1,
          serviceSocket: 'online',
        });

      const createdUser = await aggregateSession.stageCommand({
        contractName: 'createUser',
        payload: {
          id: User.prefixId(clerkUserId),
          clerkUserId,
        },
      });
      expect(createdUser._tag).toBe('Right');
      if (createdUser._tag === 'Left') {
        throw new Error(createdUser.left.message);
      }
      await expect
        .poll(
          async () => {
            const state = aggregateSession.store.getState();
            if (!state.isInitialized) return undefined;
            const aggregateRows = await Effect.runPromise(
              decodeRpc(await diagnosticRoot.listAggregateFrontendReplicas()),
            );
            return {
              executedId: state.db
                .select({ id: sessionExecutedPushedCommandDrizzleSchema.id })
                .from(sessionExecutedPushedCommandDrizzleSchema)
                .where(
                  eq(
                    sessionExecutedPushedCommandDrizzleSchema.id,
                    createdUser.right.id,
                  ),
                )
                .get()?.id,
              failed: state.db
                .select()
                .from(sessionFailedCommandDrizzleSchema)
                .all(),
              pushed: state.db
                .select()
                .from(sessionPushedCommandDrizzleSchema)
                .all(),
              staged: state.db
                .select()
                .from(sessionStagedCommandDrizzleSchema)
                .all(),
              workerFailure: aggregateRows[0]?.lastFailure,
              workerPushInFlight: aggregateRows[0]?.pushInFlight,
              workerStatus: aggregateRows[0]?.status,
            };
          },
          { interval: 100, timeout: 30_000 },
        )
        .toEqual(expect.objectContaining({ executedId: createdUser.right.id }));

      const updatedName = `Shared worker capability ${testRunId}`;
      const staged = await aggregateSession.stageCommand({
        contractName: 'updateUser',
        payload: {
          id: User.prefixId(clerkUserId),
          name: updatedName,
        },
      });
      expect(staged._tag).toBe('Right');
      await expect
        .poll(
          () => {
            const state = aggregateSession.store.getState();
            if (!state.isInitialized) return undefined;
            return state.db.query.user
              ?.findFirst({
                where: { id: { eq: User.prefixId(clerkUserId) } },
              })
              .sync()?.name;
          },
          { interval: 50, timeout: 120_000 },
        )
        .toBe(updatedName);

      expect(serviceSession.store.getState().isInitialized).toBe(true);
    } finally {
      await act(async () => {
        root.unmount();
        await Promise.resolve();
      });
      container.remove();
      globalThis.localStorage.removeItem(legacyLocatorKey);
    }

    await expect
      .poll(
        () =>
          Array.from(
            zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
          ).filter(diagnosticRoot => diagnosticRoot.userId === clerkUserId)
            .length,
        { interval: 50, timeout: 30_000 },
      )
      .toBe(0);
  }, 300_000);
});
