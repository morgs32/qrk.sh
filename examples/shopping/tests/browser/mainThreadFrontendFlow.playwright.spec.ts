/* oxlint-disable react/no-children-prop -- This exact .ts acceptance filename cannot contain JSX. */
import { act, createElement, useEffect } from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeServiceCommand } from '@zerospin/core/service/makeServiceCommand';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { AggregateFrontendJournalCommandSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import { sessionCommandJournalDrizzleSchema } from '@zerospin/core/session/sessionCommandShape';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { makeZerospinApp } from '@zerospin/react/makeZerospinApp';
import type {
  IBrowserServiceSession,
  IBrowserSession,
} from '@zerospin/react/types';
import { useLiveQuery } from '@zerospin/react/useLiveQuery';
import { useSession } from '@zerospin/react/useSession';
import {
  newMessagePortRpcSession,
  newWebSocketRpcSession,
  RpcTarget,
} from 'capnweb';
import { eq } from 'drizzle-orm';
import { Effect, Layer, ManagedRuntime, Redacted, Schema } from 'effect';
import { createRoot } from 'react-dom/client';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { afterAll, describe, expect, it } from 'vitest';

import { createProduct } from '@/zerospin/contracts/createProduct';
import { deleteProduct } from '@/zerospin/contracts/deleteProduct';
import { catalog as catalogFrontend } from '@/zerospin/frontends/catalog';
import { web as shopperFrontend } from '@/zerospin/frontends/web';
import { ClerkUserIdSchema, User } from '@/zerospin/models/User';
import { signature } from '@/zerospin/signature';

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
    makePrefixedIncrementalIdFactory('mainThreadFrontendFlow'),
    IncrementalMonotonicFactory,
    Layer.succeed(ZerospinApiUrl, 'http://127.0.0.1:3035/'),
    Layer.succeed(PublishableKey, Redacted.make('pk_test')),
  ),
);

const FlowZerospinApp = makeZerospinApp({
  systemName: 'shopping',
  authentication: { signature },
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
  const { data: cartItem } = useLiveQuery(FlowZerospinApp.frontends.web, {
    query: db =>
      db.query.cartItem.findFirst({
        with: { product: true },
      }),
  });
  const { onSessions } = props;

  useEffect(() => {
    onSessions(aggregateSession, serviceSession);
  }, [aggregateSession, onSessions, serviceSession]);

  return createElement(
    'output',
    { 'data-testid': 'cart-summary' },
    JSON.stringify({
      name: cartItem?.product.name ?? null,
      total:
        cartItem === undefined
          ? null
          : cartItem.product.price *
            (cartItem.unit === 'case' ? cartItem.amount * 12 : cartItem.amount),
    }),
  );
}

afterAll(async () => {
  await testRuntime.dispose();
});

describe('main-thread frontend flow', () => {
  it('runs one page-owned aggregate and service main-thread session', async () => {
    await expect
      .poll(
        async () => {
          try {
            using gatewayApi = newWebSocketRpcSession<GatewayApi>(
              'ws://127.0.0.1:3035/',
            );
            using systemApi = await gatewayApi.getSystemApi({
              zerospinSecretKey: 'sk_test',
            });
            await Effect.runPromise(
              decodeRpc(
                (await systemApi.healthcheck({ args: [], traceContext: null }))
                  .result,
              ),
            );
            return true;
          } catch {
            return false;
          }
        },
        { interval: 500, timeout: 120_000 },
      )
      .toBe(true);

    const seedProductCommand = await testRuntime.runPromise(
      makeServiceCommand({
        contracts: { createProduct },
        serviceName: 'app',
        contractName: 'createProduct',
        payload: {
          description: `Browser acceptance product ${testRunId}`,
          name: `Browser Product ${testRunId}`,
          price: 20,
        },
      }),
    );
    const encodedSeedProductCommand = {
      ...seedProductCommand,
      payload: await testRuntime.runPromise(
        createProduct.encodePayload({ payload: seedProductCommand.payload }),
      ),
    };
    using seedGatewayApi = newWebSocketRpcSession<GatewayApi>(
      'ws://127.0.0.1:3035/',
    );
    using seedSystemApi = await seedGatewayApi.getSystemApi({
      zerospinSecretKey: 'sk_test',
    });
    await Effect.runPromise(
      decodeRpc(
        (
          await seedSystemApi.finalizeServiceCommand({
            traceContext: null,
            args: [encodedSeedProductCommand],
          })
        ).result,
      ),
    );

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
      expect(aggregateState.sessionStatus).toBe('current');
      expect(aggregateState.backupState.status).toBe('ready');
      expect(serviceState.sessionStatus).toBe('current');
      expect(serviceState.backupState.status).toBe('ready');
      expect(signatureCallCount).toBeGreaterThanOrEqual(4);
      expect(aggregateState.db).not.toBe(serviceState.db);

      const aggregateDevtoolsEntry = zerospinDevtoolsStore
        .getState()
        .aggregateSessionsById.get(aggregateSession.sessionId);
      const serviceDevtoolsEntry = zerospinDevtoolsStore
        .getState()
        .serviceSessionsById.get(serviceSession.sessionId);
      expect(aggregateDevtoolsEntry?.session).toBe(
        aggregateSession.coreSession,
      );
      expect(serviceDevtoolsEntry?.getUserId()).toBe(clerkUserId);

      const createdUser = await aggregateSession.executeCommand({
        contractName: 'createUser',
        payload: {
          id: User.prefixId(clerkUserId),
          clerkUserId,
        },
      });
      expect(createdUser._tag).toBe('Success');
      if (createdUser._tag === 'Failure') {
        throw new Error(createdUser.failure.message);
      }
      await expect
        .poll(
          () => {
            const state = aggregateSession.store.getState();
            if (!state.isInitialized) return undefined;
            return state.db
              .select({
                pushIndex: sessionCommandJournalDrizzleSchema.pushIndex,
              })
              .from(sessionCommandJournalDrizzleSchema)
              .where(
                eq(
                  sessionCommandJournalDrizzleSchema.id,
                  createdUser.success.id,
                ),
              )
              .get()?.pushIndex;
          },
          { interval: 100, timeout: 30_000 },
        )
        .toBeGreaterThan(0);

      const updatedName = `Main-thread capability ${testRunId}`;
      const updatedUser = await aggregateSession.executeCommand({
        contractName: 'updateUser',
        payload: {
          id: User.prefixId(clerkUserId),
          name: updatedName,
        },
      });
      expect(updatedUser._tag).toBe('Success');
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

      const catalogProduct = serviceState.db.query.product.findFirst().sync();
      if (catalogProduct === undefined) {
        throw new Error('Expected the seeded catalog to contain a Product');
      }
      const cartAggregateSession = sessions.aggregate;
      if (cartAggregateSession === null) {
        throw new Error('Aggregate browser session must remain acquired');
      }
      const createdCart = Effect.runSync(
        decodeRpc(
          cartAggregateSession.executeCommand({
            contractName: 'createCart',
            payload: { userId: User.prefixId(clerkUserId) },
          }),
        ),
      );
      await expect
        .poll(
          () => {
            const currentAggregateSession = sessions.aggregate;
            if (currentAggregateSession === null) return undefined;
            const currentAggregateState =
              currentAggregateSession.store.getState();
            if (!currentAggregateState.isInitialized) return undefined;
            return currentAggregateState.db
              .select({
                pushIndex: sessionCommandJournalDrizzleSchema.pushIndex,
              })
              .from(sessionCommandJournalDrizzleSchema)
              .where(eq(sessionCommandJournalDrizzleSchema.id, createdCart.id))
              .get()?.pushIndex;
          },
          { interval: 100, timeout: 15_000 },
        )
        .toBeGreaterThan(0);
      const addToCartAggregateSession = sessions.aggregate;
      if (addToCartAggregateSession === null) {
        throw new Error('Aggregate browser session must remain acquired');
      }
      const addedToCart = Effect.runSync(
        decodeRpc(
          addToCartAggregateSession.executeCommand({
            contractName: 'addToCart',
            payload: {
              cartId: createdCart.payload.id,
              product: catalogProduct,
              quantity: 2,
            },
          }),
        ),
      );
      if (aggregateDevtoolsEntry === undefined) {
        throw new Error('Expected one aggregate frontend DevTools entry');
      }
      await Effect.runPromise(
        decodeRpc(
          await aggregateDevtoolsEntry.setPushPaused({ pushPaused: true }),
        ),
      );
      expect(
        await Effect.runPromise(
          decodeRpc(await aggregateDevtoolsEntry.pushNow()),
        ),
      ).toEqual({ status: 'pushed' });
      await Effect.runPromise(
        decodeRpc(
          await aggregateDevtoolsEntry.setPushPaused({ pushPaused: false }),
        ),
      );
      await expect
        .poll(
          () => {
            const currentAggregateSession = sessions.aggregate;
            if (currentAggregateSession === null) return undefined;
            const currentAggregateState =
              currentAggregateSession.store.getState();
            if (!currentAggregateState.isInitialized) return undefined;
            const retainedCommand = currentAggregateState.db
              .select({
                command: sessionCommandJournalDrizzleSchema.command,
                sessionId: sessionCommandJournalDrizzleSchema.sessionId,
                sessionIndex: sessionCommandJournalDrizzleSchema.sessionIndex,
              })
              .from(sessionCommandJournalDrizzleSchema)
              .where(eq(sessionCommandJournalDrizzleSchema.id, addedToCart.id))
              .get();
            if (retainedCommand === undefined) return undefined;
            const command = Schema.decodeUnknownSync(
              Schema.fromJsonString(AggregateFrontendJournalCommandSchema),
            )(retainedCommand.command);
            if (
              command.id !== addedToCart.id ||
              retainedCommand.sessionId !== currentAggregateSession.sessionId ||
              !('pushIndex' in command) ||
              command.pushIndex === null
            ) {
              return undefined;
            }
            return retainedCommand.sessionIndex;
          },
          { interval: 100, timeout: 15_000 },
        )
        .toBeGreaterThan(0);

      const latestAggregateSession = sessions.aggregate;
      if (latestAggregateSession === null) {
        throw new Error('Aggregate browser session must remain acquired');
      }
      const currentAggregateState = latestAggregateSession.store.getState();
      if (!currentAggregateState.isInitialized) {
        throw new Error('Aggregate browser session must remain initialized');
      }
      const originalCartItem = currentAggregateState.db.query.cartItem
        .findFirst()
        .sync();
      if (originalCartItem === undefined) {
        throw new Error('Expected the aggregate session to contain a CartItem');
      }
      await expect
        .poll(
          () =>
            container.querySelector('[data-testid="cart-summary"]')
              ?.textContent,
          { interval: 50, timeout: 30_000 },
        )
        .toBe(
          JSON.stringify({
            name: catalogProduct.name,
            total: catalogProduct.price * 2,
          }),
        );

      using systemGatewayApi = newWebSocketRpcSession<GatewayApi>(
        'ws://127.0.0.1:3035/',
      );
      using systemApi = await systemGatewayApi.getSystemApi({
        zerospinSecretKey: 'sk_test',
      });
      const deleteProductCommand = await testRuntime.runPromise(
        makeServiceCommand({
          contracts: { deleteProduct },
          serviceName: 'app',
          contractName: 'deleteProduct',
          payload: { id: catalogProduct.id },
        }),
      );
      const encodedDeleteProductCommand = {
        ...deleteProductCommand,
        payload: await testRuntime.runPromise(
          deleteProduct.encodePayload({
            payload: deleteProductCommand.payload,
          }),
        ),
      };
      const deletedEnvelope = await systemApi.finalizeServiceCommand({
        traceContext: null,
        args: [encodedDeleteProductCommand],
      });
      const deletedCommand = await Effect.runPromise(
        decodeRpc(deletedEnvelope.result),
      );
      expect(deletedCommand).toEqual(
        expect.objectContaining({
          id: encodedDeleteProductCommand.id,
          failedAt: null,
          failure: null,
        }),
      );
      const retainedDeleteResultBytes = JSON.stringify(deletedEnvelope.result);

      await expect
        .poll(
          () => {
            const currentServiceSession = sessions.service;
            const currentAggregateSession = sessions.aggregate;
            if (
              currentServiceSession === null ||
              currentAggregateSession === null
            ) {
              return undefined;
            }
            const currentServiceState = currentServiceSession.store.getState();
            const currentAggregateState =
              currentAggregateSession.store.getState();
            if (
              !currentServiceState.isInitialized ||
              !currentAggregateState.isInitialized
            ) {
              return undefined;
            }
            const serviceProduct = currentServiceState.db.query.product
              .findFirst({
                where: { id: { eq: catalogProduct.id } },
              })
              .sync();
            const replica = currentAggregateState.db.query.product
              .findFirst({
                where: { id: { eq: catalogProduct.id } },
              })
              .sync();
            const retainedCartItem = currentAggregateState.db.query.cartItem
              .findFirst({
                where: { id: { eq: originalCartItem.id } },
                with: { product: true },
              })
              .sync();
            return {
              serviceProduct,
              replica:
                replica === undefined
                  ? undefined
                  : {
                      createdAt: replica.createdAt,
                      deletedAtIsDate: replica.deletedAt instanceof Date,
                      description: replica.description,
                      id: replica.id,
                      modelName: replica.modelName,
                      name: replica.name,
                      price: replica.price,
                      timestampsMatch:
                        replica.deletedAt?.getTime() ===
                        replica.updatedAt.getTime(),
                      version: replica.version,
                    },
              relation:
                retainedCartItem === undefined
                  ? undefined
                  : {
                      cartItemId: retainedCartItem.id,
                      productId: retainedCartItem.productId,
                      productName: retainedCartItem.product.name,
                    },
              rendered: container.querySelector('[data-testid="cart-summary"]')
                ?.textContent,
            };
          },
          { interval: 100, timeout: 120_000 },
        )
        .toEqual({
          serviceProduct: undefined,
          replica: {
            createdAt: catalogProduct.createdAt,
            deletedAtIsDate: true,
            description: catalogProduct.description,
            id: catalogProduct.id,
            modelName: catalogProduct.modelName,
            name: catalogProduct.name,
            price: catalogProduct.price,
            timestampsMatch: true,
            version: catalogProduct.version,
          },
          relation: {
            cartItemId: originalCartItem.id,
            productId: catalogProduct.id,
            productName: catalogProduct.name,
          },
          rendered: JSON.stringify({
            name: catalogProduct.name,
            total: catalogProduct.price * 2,
          }),
        });

      const recreatedName = `Revived Product ${testRunId}`;
      const recreatedDescription = `Revived description ${testRunId}`;
      const recreatedPrice = catalogProduct.price + 7;
      const recreateProductCommand = await testRuntime.runPromise(
        makeServiceCommand({
          contracts: { createProduct },
          serviceName: 'app',
          contractName: 'createProduct',
          payload: {
            id: catalogProduct.id,
            description: recreatedDescription,
            name: recreatedName,
            price: recreatedPrice,
          },
        }),
      );
      const encodedRecreateProductCommand = {
        ...recreateProductCommand,
        payload: await testRuntime.runPromise(
          createProduct.encodePayload({
            payload: recreateProductCommand.payload,
          }),
        ),
      };
      const recreatedEnvelope = await systemApi.finalizeServiceCommand({
        traceContext: null,
        args: [encodedRecreateProductCommand],
      });
      const recreatedCommand = await Effect.runPromise(
        decodeRpc(recreatedEnvelope.result),
      );
      expect(recreatedCommand).toEqual(
        expect.objectContaining({
          id: encodedRecreateProductCommand.id,
          failedAt: null,
          failure: null,
        }),
      );

      await expect
        .poll(
          () => {
            const currentServiceSession = sessions.service;
            const currentAggregateSession = sessions.aggregate;
            if (
              currentServiceSession === null ||
              currentAggregateSession === null
            ) {
              return undefined;
            }
            const currentServiceState = currentServiceSession.store.getState();
            const currentAggregateState =
              currentAggregateSession.store.getState();
            if (
              !currentServiceState.isInitialized ||
              !currentAggregateState.isInitialized
            ) {
              return undefined;
            }
            const serviceProduct = currentServiceState.db.query.product
              .findFirst({
                where: { id: { eq: catalogProduct.id } },
              })
              .sync();
            const replica = currentAggregateState.db.query.product
              .findFirst({
                where: { id: { eq: catalogProduct.id } },
              })
              .sync();
            const revivedCartItem = currentAggregateState.db.query.cartItem
              .findFirst({
                where: { id: { eq: originalCartItem.id } },
                with: { product: true },
              })
              .sync();
            return {
              serviceProduct:
                serviceProduct === undefined
                  ? undefined
                  : {
                      description: serviceProduct.description,
                      id: serviceProduct.id,
                      name: serviceProduct.name,
                      price: serviceProduct.price,
                    },
              replica:
                replica === undefined
                  ? undefined
                  : {
                      deletedAt: replica.deletedAt,
                      description: replica.description,
                      id: replica.id,
                      name: replica.name,
                      price: replica.price,
                    },
              cartItem:
                revivedCartItem === undefined
                  ? undefined
                  : {
                      amount: revivedCartItem.amount,
                      cartId: revivedCartItem.cartId,
                      id: revivedCartItem.id,
                      productId: revivedCartItem.productId,
                      productName: revivedCartItem.product.name,
                      unit: revivedCartItem.unit,
                    },
              rendered: container.querySelector('[data-testid="cart-summary"]')
                ?.textContent,
            };
          },
          { interval: 100, timeout: 120_000 },
        )
        .toEqual({
          serviceProduct: {
            description: recreatedDescription,
            id: catalogProduct.id,
            name: recreatedName,
            price: recreatedPrice,
          },
          replica: {
            deletedAt: null,
            description: recreatedDescription,
            id: catalogProduct.id,
            name: recreatedName,
            price: recreatedPrice,
          },
          cartItem: {
            amount: originalCartItem.amount,
            cartId: originalCartItem.cartId,
            id: originalCartItem.id,
            productId: originalCartItem.productId,
            productName: recreatedName,
            unit: originalCartItem.unit,
          },
          rendered: JSON.stringify({
            name: recreatedName,
            total: recreatedPrice * 2,
          }),
        });

      const serviceChainsEnvelope = await systemApi.getServiceCommandChains({
        traceContext: null,
        args: [],
      });
      const serviceChains = await Effect.runPromise(
        decodeRpc(serviceChainsEnvelope.result),
      );
      const serviceChainRegistration = serviceChains.find(registration =>
        registration.tableNames.includes('commands'),
      );
      if (serviceChainRegistration === undefined) {
        throw new Error(
          'Expected the current ServiceCommandChain registration',
        );
      }
      const commandsBeforeOldDeleteRetryEnvelope =
        await systemApi.getServiceCommandChainTableRows({
          traceContext: null,
          args: [
            {
              repoName: serviceChainRegistration.repoName,
              tableName: 'commands',
            },
          ],
        });
      const commandsBeforeOldDeleteRetry = await Effect.runPromise(
        decodeRpc(commandsBeforeOldDeleteRetryEnvelope.result),
      );

      const retriedDeleteEnvelope = await systemApi.finalizeServiceCommand({
        traceContext: null,
        args: [encodedDeleteProductCommand],
      });
      expect(JSON.stringify(retriedDeleteEnvelope.result)).toBe(
        retainedDeleteResultBytes,
      );
      const commandsAfterOldDeleteRetryEnvelope =
        await systemApi.getServiceCommandChainTableRows({
          traceContext: null,
          args: [
            {
              repoName: serviceChainRegistration.repoName,
              tableName: 'commands',
            },
          ],
        });
      expect(
        await Effect.runPromise(
          decodeRpc(commandsAfterOldDeleteRetryEnvelope.result),
        ),
      ).toEqual(commandsBeforeOldDeleteRetry);
      const finalServiceSession = sessions.service;
      const finalAggregateSession = sessions.aggregate;
      if (finalServiceSession === null || finalAggregateSession === null) {
        throw new Error('Both browser sessions must remain acquired');
      }
      const finalServiceState = finalServiceSession.store.getState();
      const finalAggregateState = finalAggregateSession.store.getState();
      if (
        !finalServiceState.isInitialized ||
        !finalAggregateState.isInitialized
      ) {
        throw new Error('Both browser sessions must remain initialized');
      }
      expect(
        finalServiceState.db.query.product
          .findFirst({
            where: { id: { eq: catalogProduct.id } },
          })
          .sync(),
      ).toMatchObject({
        description: recreatedDescription,
        id: catalogProduct.id,
        name: recreatedName,
        price: recreatedPrice,
      });
      expect(
        finalAggregateState.db.query.product
          .findFirst({
            where: { id: { eq: catalogProduct.id } },
          })
          .sync(),
      ).toMatchObject({
        deletedAt: null,
        description: recreatedDescription,
        id: catalogProduct.id,
        name: recreatedName,
        price: recreatedPrice,
      });
      expect(
        finalAggregateState.db.query.cartItem.findFirst().sync(),
      ).toMatchObject({
        amount: originalCartItem.amount,
        cartId: originalCartItem.cartId,
        id: originalCartItem.id,
        modelName: originalCartItem.modelName,
        productId: originalCartItem.productId,
        unit: originalCartItem.unit,
        version: originalCartItem.version,
      });
      expect(
        container.querySelector('[data-testid="cart-summary"]')?.textContent,
      ).toBe(
        JSON.stringify({
          name: recreatedName,
          total: recreatedPrice * 2,
        }),
      );

      await expect
        .poll(
          () => ({
            aggregate:
              finalAggregateSession.store.getState().backupState.status,
            service: finalServiceSession.store.getState().backupState.status,
          }),
          { interval: 25, timeout: 30_000 },
        )
        .toEqual({ aggregate: 'ready', service: 'ready' });

      const observedBackupStates = [
        finalAggregateSession.store.getState().backupState.status,
      ];
      const unsubscribe = finalAggregateSession.store.subscribe(state => {
        observedBackupStates.push(state.backupState.status);
      });
      const { cdp } = await import('vitest/browser');
      const targets = await cdp().send('Target.getTargets');
      const routerTarget = targets.targetInfos.find(
        target =>
          target.type === 'shared_worker' &&
          target.url.includes('opfsBackupWorker.bundle.js'),
      );
      if (routerTarget === undefined) {
        throw new Error('Chromium must expose the OPFS backup mediator');
      }
      const faultControl = new SharedWorker(routerTarget.url, {
        name: 'zerospin:opfs-backup-router',
        type: 'module',
      });
      const routerReady = Promise.withResolvers<void>();
      faultControl.port.addEventListener('message', event => {
        if (event.data?.type === 'RouterReady') routerReady.resolve();
      });
      faultControl.port.start();
      await Promise.race([
        routerReady.promise,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Injected client did not reach router')),
            30_000,
          ),
        ),
      ]);

      const applyDispatched = Promise.withResolvers<void>();
      const blockedApply = Promise.withResolvers<never>();
      const leaderChannel = new MessageChannel();
      leaderChannel.port1.start();
      const injectedLeader = newMessagePortRpcSession(
        leaderChannel.port1,
        new (class extends RpcTarget {
          async applyTransaction() {
            applyDispatched.resolve();
            return blockedApply.promise;
          }

          async releaseClient() {
            return encodeSuccess(undefined);
          }
        })(),
      );
      faultControl.port.postMessage(
        { type: 'InstallLeader', port: leaderChannel.port2 },
        [leaderChannel.port2],
      );

      try {
        const faultedUpdate = await finalAggregateSession.executeCommand({
          contractName: 'updateUser',
          payload: {
            id: User.prefixId(clerkUserId),
            name: `Recovered backup ${testRunId}`,
          },
        });
        expect(faultedUpdate._tag).toBe('Success');
        await Promise.race([
          applyDispatched.promise,
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('Aggregate backup was not dispatched')),
              30_000,
            ),
          ),
        ]);
        const closedTarget = await cdp().send('Target.closeTarget', {
          targetId: routerTarget.targetId,
        });
        expect(closedTarget.success).toBe(true);
        await expect
          .poll(
            async () => {
              const remainingTargets = await cdp().send('Target.getTargets');
              return remainingTargets.targetInfos.some(
                target => target.targetId === routerTarget.targetId,
              );
            },
            { interval: 50, timeout: 30_000 },
          )
          .toBe(false);
        await expect
          .poll(() => observedBackupStates.includes('repairing'), {
            interval: 10,
            timeout: 30_000,
          })
          .toBe(true);

        const serviceDuringAggregateRepair =
          finalServiceSession.store.getState();
        if (!serviceDuringAggregateRepair.isInitialized) {
          throw new Error(
            'The unrelated service session must remain initialized',
          );
        }
        expect(serviceDuringAggregateRepair.sessionStatus).toBe('current');
        expect(serviceDuringAggregateRepair.backupState.status).toBe('ready');
        expect(
          serviceDuringAggregateRepair.db.query.product.findFirst().sync(),
        ).toBeDefined();

        await expect
          .poll(
            () => finalAggregateSession.store.getState().backupState.status,
            { interval: 25, timeout: 60_000 },
          )
          .toBe('ready');
      } finally {
        injectedLeader[Symbol.dispose]();
        leaderChannel.port1.close();
        faultControl.port.close();
        unsubscribe();
      }
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
            zerospinDevtoolsStore.getState().aggregateSessionsById.values(),
          ).filter(
            entry => entry.session.store.getState().userId === clerkUserId,
          ).length,
        { interval: 50, timeout: 30_000 },
      )
      .toBe(0);
  }, 300_000);
});
