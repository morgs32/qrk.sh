/* oxlint-disable react/no-children-prop -- This exact .ts acceptance filename cannot contain JSX. */
import { act, createElement, useEffect } from 'react';

import { encodePayload } from '@zerospin/core/contracts/encodePayload';
import { prefixId } from '@zerospin/core/models/prefixId';
import { makeServiceCommand } from '@zerospin/core/service/makeServiceCommand';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { AggregateFrontendJournalCommandSchema } from '@zerospin/core/session/AggregateSelectedCommandSchema';
import { sessionCommandJournalDrizzleSchema } from '@zerospin/core/session/sessionCommandShape';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import {
  makeRuntime,
  makeSession,
  stageCommand,
  useInitializeSession,
  useLiveQuery,
} from '@zerospin/react';
import { newWebSocketRpcSession } from 'capnweb';
import { eq } from 'drizzle-orm';
import { Effect, Layer, Redacted, Schema } from 'effect';
import { createRoot } from 'react-dom/client';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { afterAll, describe, expect, it } from 'vitest';

import { cartV1 } from '@/zerospin/aggregates/shopper/models/cart/CartV1';
import { cartItemV2 } from '@/zerospin/aggregates/shopper/models/cartItem/CartItemV2';
import { ClerkUserIdSchema } from '@/zerospin/aggregates/shopper/models/user/UserV1';
import { createProductV1 } from '@/zerospin/services/app/contracts/createProduct/CreateProductV1';
import { deleteProductV1 } from '@/zerospin/services/app/contracts/deleteProduct/DeleteProductV1';
import { productV1 } from '@/zerospin/services/app/models/product/ProductV1';
import type { system } from '@/zerospin/system';
import { Catalog, Shopper } from '@/zerospin/ZerospinApp';

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

const testRuntimeLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('mainThreadFrontendFlow'),
  Layer.succeed(ZerospinApiUrl, 'http://127.0.0.1:3035/'),
  Layer.succeed(PublishableKey, Redacted.make('pk_test')),
);
const testRuntime = makeRuntime({ layer: testRuntimeLayer });

const aggregateSession = makeSession({
  frontend: Shopper,
  runtime: testRuntime,
  systemName: 'shopping',
});
const serviceSession = makeSession({
  frontend: Catalog,
  runtime: testRuntime,
  systemName: 'shopping',
});

function FlowSessionsRoot(props: {
  generateSignature: () => Effect.Effect<{ clerkUserId: typeof clerkUserId }>;
  onReady(): void;
}) {
  const { generateSignature, onReady } = props;
  const aggregate = useInitializeSession<typeof system>({
    session: aggregateSession,
    generateSignature,
  });
  const service = useInitializeSession<typeof system>({
    session: serviceSession,
    generateSignature,
  });

  useEffect(() => {
    if (aggregate.isInitialized && service.isInitialized) {
      onReady();
    }
  }, [aggregate.isInitialized, onReady, service.isInitialized]);

  // Initialize both sessions before any query hook; useLiveQuery throws without a DB.
  if (!aggregate.isInitialized || !service.isInitialized) {
    return null;
  }

  return createElement(CartSummary);
}

function CartSummary() {
  const { data: cartItem } = useLiveQuery({
    session: aggregateSession,
    query: db =>
      db.query.cartItem.findFirst({
        with: { product: true },
      }),
  });

  return createElement(
    'output',
    { 'data-testid': 'cart-summary' },
    JSON.stringify({
      name: cartItem?.product.name ?? null,
      total:
        cartItem === undefined
          ? null
          : cartItem.product.price * cartItem.amount,
    }),
  );
}

afterAll(async () => {
  await aggregateSession.dispose();
  await serviceSession.dispose();
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
        contracts: { createProduct: createProductV1 },
        serviceName: 'app',
        serviceVersion: '1.0.0',
        contractName: 'createProduct',
        payload: {
          id: prefixId(productV1, testRunId),
          description: `Browser acceptance product ${testRunId}`,
          name: `Browser Product ${testRunId}`,
          price: 20,
        },
      }),
    );
    const encodedSeedProductCommand = {
      ...seedProductCommand,
      payload: await testRuntime.runPromise(
        encodePayload(createProductV1, {
          version: seedProductCommand.contractVersion,
          payload: seedProductCommand.payload,
        }),
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
          await seedSystemApi.executeServiceCommand({
            traceContext: null,
            args: [
              { serviceVersion: '1.0.0', command: encodedSeedProductCommand },
            ],
          })
        ).result,
      ),
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let sessionsReady = false;
    let signatureCallCount = 0;

    try {
      await act(async () => {
        root.render(
          createElement(FlowSessionsRoot, {
            generateSignature: () => {
              signatureCallCount += 1;
              return Effect.succeed({ clerkUserId });
            },
            onReady: () => {
              sessionsReady = true;
            },
          }),
        );
        await Promise.resolve();
      });

      await expect
        .poll(
          () =>
            sessionsReady &&
            (aggregateSession.store.getState().isInitialized ?? false),
          { interval: 100, timeout: 30_000 },
        )
        .toBe(true);
      await expect
        .poll(
          () => serviceSession.store.getState().isInitialized ?? false,
          {
            interval: 100,
            timeout: 120_000,
          },
        )
        .toBe(true);

      const aggregateState = aggregateSession.store.getState();
      const serviceState = serviceSession.store.getState();
      if (!aggregateState.isInitialized || !serviceState.isInitialized) {
        throw new Error('Both browser session stores must initialize');
      }
      expect(aggregateState.sessionStatus).toBe('current');
      expect(aggregateState.backupState.status).toBe('ready');
      expect(serviceState.sessionStatus).toBe('current');
      expect(serviceState.backupState.status).toBe('ready');
      expect(signatureCallCount).toBeGreaterThanOrEqual(2);
      expect(aggregateState.db).not.toBe(serviceState.db);

      const aggregateDevtoolsEntry = zerospinDevtoolsStore
        .getState()
        .aggregateSessionsById.get(aggregateSession.sessionId!);
      const serviceDevtoolsEntry = zerospinDevtoolsStore
        .getState()
        .serviceSessionsById.get(serviceSession.sessionId!);
      expect(aggregateDevtoolsEntry?.session).toBe(aggregateSession);
      expect(serviceDevtoolsEntry?.getAuthentication()).toEqual({
        clerkUserId,
      });
      const userRow = aggregateState.db.query.user
        .findFirst({ where: { clerkUserId } })
        .sync();
      if (userRow === undefined) {
        throw new Error('Authentication must provision the User');
      }
      const userId = userRow.id;
      expect(userId).not.toBe(`usr_${clerkUserId}`);

      const createdUser = stageCommand({
        session: aggregateSession,
        contractName: 'updateUser',
        payload: {
          id: userId,
          name: 'Provisioned user',
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
      const updatedUser = stageCommand({
        session: aggregateSession,
        contractName: 'updateUser',
        payload: {
          id: userId,
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
                where: {
                  id: {
                    eq: userId,
                  },
                },
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
      const createdCart = Effect.runSync(
        decodeRpc(
          stageCommand({
            session: aggregateSession,
            contractName: 'createCart',
            payload: {
              id: prefixId(cartV1, testRunId),
              userId,
            },
          }),
        ),
      );
      await expect
        .poll(
          () => {
            const currentAggregateState = aggregateSession.store.getState();
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
      const addedToCart = Effect.runSync(
        decodeRpc(
          stageCommand({
            session: aggregateSession,
            contractName: 'addToCart',
            payload: {
              cartItemId: prefixId(cartItemV2, testRunId),
              cartId: createdCart.payload.id,
              product: catalogProduct,
              amount: 2,
            },
          }),
        ),
      );
      if (
        aggregateDevtoolsEntry?.setPushPaused === undefined ||
        aggregateDevtoolsEntry.pushNow === undefined
      ) {
        throw new Error('Expected aggregate frontend push controls');
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
            const currentAggregateState = aggregateSession.store.getState();
            if (!currentAggregateState.isInitialized) return undefined;
            const retainedCommand = currentAggregateState.db
              .select({
                command: sessionCommandJournalDrizzleSchema.command,
                sessionId: sessionCommandJournalDrizzleSchema.sessionId,
                sessionIndex: sessionCommandJournalDrizzleSchema.sessionIndex,
                pushIndex: sessionCommandJournalDrizzleSchema.pushIndex,
              })
              .from(sessionCommandJournalDrizzleSchema)
              .where(eq(sessionCommandJournalDrizzleSchema.id, addedToCart.id))
              .get();
            if (retainedCommand === undefined) return undefined;
            const command = Schema.decodeUnknownSync(
              Schema.fromJsonString(AggregateFrontendJournalCommandSchema),
            )(retainedCommand.command);
            if (
              !('id' in command) ||
              !('aggregateIndex' in command) ||
              command.id !== addedToCart.id ||
              retainedCommand.sessionId !== aggregateSession.sessionId ||
              retainedCommand.pushIndex === null
            ) {
              return undefined;
            }
            return {
              sessionIndex: retainedCommand.sessionIndex,
              failure: command.failure,
            };
          },
          { interval: 100, timeout: 15_000 },
        )
        .toEqual({ sessionIndex: addedToCart.sessionIndex, failure: null });

      const currentAggregateState = aggregateSession.store.getState();
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
          contracts: { deleteProduct: deleteProductV1 },
          serviceName: 'app',
          serviceVersion: '1.0.0',
          contractName: 'deleteProduct',
          payload: { id: catalogProduct.id },
        }),
      );
      const encodedDeleteProductCommand = {
        ...deleteProductCommand,
        payload: await testRuntime.runPromise(
          encodePayload(deleteProductV1, {
            version: deleteProductCommand.contractVersion,
            payload: deleteProductCommand.payload,
          }),
        ),
      };
      const deletedEnvelope = await systemApi.executeServiceCommand({
        traceContext: null,
        args: [
          { serviceVersion: '1.0.0', command: encodedDeleteProductCommand },
        ],
      });
      const deletedCommand = await Effect.runPromise(
        decodeRpc(deletedEnvelope.result),
      );
      expect(deletedCommand).toEqual(
        expect.objectContaining({
          id: encodedDeleteProductCommand.id,
        }),
      );
      const retainedDeleteResultBytes = JSON.stringify(deletedEnvelope.result);

      await expect
        .poll(
          () => {
            const currentServiceState = serviceSession.store.getState();
            const currentAggregateState =
              aggregateSession.store.getState();
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
          contracts: { createProduct: createProductV1 },
          serviceName: 'app',
          serviceVersion: '1.0.0',
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
          encodePayload(createProductV1, {
            version: recreateProductCommand.contractVersion,
            payload: recreateProductCommand.payload,
          }),
        ),
      };
      const recreatedEnvelope = await systemApi.executeServiceCommand({
        traceContext: null,
        args: [
          { serviceVersion: '1.0.0', command: encodedRecreateProductCommand },
        ],
      });
      const recreatedCommand = await Effect.runPromise(
        decodeRpc(recreatedEnvelope.result),
      );
      expect(recreatedCommand).toEqual(
        expect.objectContaining({
          id: encodedRecreateProductCommand.id,
        }),
      );

      await expect
        .poll(
          () => {
            const currentServiceState = serviceSession.store.getState();
            const currentAggregateState =
              aggregateSession.store.getState();
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
          },
          rendered: JSON.stringify({
            name: recreatedName,
            total: recreatedPrice * 2,
          }),
        });

      const serviceChainsEnvelope = await systemApi.getServiceAdmittedChains({
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
          'Expected the current ServiceAdmittedChain registration',
        );
      }
      const commandsBeforeOldDeleteRetryEnvelope =
        await systemApi.getServiceAdmittedChainTableRows({
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

      const retriedDeleteEnvelope = await systemApi.executeServiceCommand({
        traceContext: null,
        args: [
          { serviceVersion: '1.0.0', command: encodedDeleteProductCommand },
        ],
      });
      expect(JSON.stringify(retriedDeleteEnvelope.result)).toBe(
        retainedDeleteResultBytes,
      );
      const commandsAfterOldDeleteRetryEnvelope =
        await systemApi.getServiceAdmittedChainTableRows({
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
      const finalServiceState = serviceSession.store.getState();
      const finalAggregateState = aggregateSession.store.getState();
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
              aggregateSession.store.getState().backupState.status,
            service: serviceSession.store.getState().backupState.status,
          }),
          { interval: 25, timeout: 30_000 },
        )
        .toEqual({ aggregate: 'ready', service: 'ready' });

      const aggregateExecutionId = aggregateSession.sessionId;
      const serviceExecutionId = serviceSession.sessionId;
      if (aggregateExecutionId === null || serviceExecutionId === null) {
        throw new Error('Both browser sessions must expose execution IDs');
      }
      const aggregateDb = finalAggregateState.db;
      const serviceDb = finalServiceState.db;
      const { cdp } = await import('vitest/browser');
      const targets = await cdp().send('Target.getTargets');
      const workerTarget = targets.targetInfos.find(
        target =>
          target.type === 'shared_worker' &&
          target.url.endsWith('/__zerospin/backup-worker.js'),
      );
      if (workerTarget === undefined) {
        throw new Error('Expected the IndexedDB backup SharedWorker');
      }
      expect(
        (
          await cdp().send('Target.closeTarget', {
            targetId: workerTarget.targetId,
          })
        ).success,
      ).toBe(true);
      await expect
        .poll(
          () => ({
            aggregate: aggregateSession.store.getState().sessionStatus,
            service: serviceSession.store.getState().sessionStatus,
            renewedAggregate:
              aggregateSession.sessionId !== aggregateExecutionId,
            renewedService:
              serviceSession.sessionId !== serviceExecutionId,
            aggregateBackup:
              aggregateSession.store.getState().backupState.status,
            serviceBackup:
              serviceSession.store.getState().backupState.status,
          }),
          { timeout: 60_000 },
        )
        .toEqual({
          aggregate: 'current',
          service: 'current',
          renewedAggregate: true,
          renewedService: true,
          aggregateBackup: 'ready',
          serviceBackup: 'ready',
        });
      const renewedAggregate = aggregateSession.store.getState();
      const renewedService = serviceSession.store.getState();
      if (!renewedAggregate.isInitialized || !renewedService.isInitialized) {
        throw new Error('Both replicas must resume');
      }
      expect(aggregateSession.store.getState().isInitialized).toBe(true);
      expect(serviceSession.store.getState().isInitialized).toBe(true);
      expect(renewedAggregate.db).toBe(aggregateDb);
      expect(renewedService.db).toBe(serviceDb);
      expect(
        zerospinDevtoolsStore
          .getState()
          .aggregateSessionsById.has(aggregateExecutionId),
      ).toBe(false);
      const renewedSessionId = aggregateSession.sessionId;
      if (renewedSessionId === null) {
        throw new Error('Renewed aggregate session must expose an execution ID');
      }
      expect(
        zerospinDevtoolsStore
          .getState()
          .aggregateSessionsById.has(renewedSessionId),
      ).toBe(true);
    } finally {
      await act(async () => {
        root.unmount();
        await Promise.resolve();
      });
      container.remove();
    }

    await expect
      .poll(
        () =>
          Array.from(
            zerospinDevtoolsStore.getState().aggregateSessionsById.values(),
          ).filter(
            entry =>
              entry.session.store.getState().authentication?.clerkUserId ===
              clerkUserId,
          ).length,
        { interval: 50, timeout: 30_000 },
      )
      .toBe(0);
  }, 300_000);
});
