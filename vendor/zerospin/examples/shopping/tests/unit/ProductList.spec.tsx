import { act } from 'react';

import { waitFor } from '@testing-library/react';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
// @vitest-environment jsdom
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { initializeGuards as initializeFrontendGuards } from '@zerospin/core/frontendController/initializeGuards';
import { prefixId } from '@zerospin/core/models/prefixId';
import { applyAggregateFrontendState } from '@zerospin/core/session/applyAggregateFrontendState';
import { makeAggregateSession } from '@zerospin/core/session/makeAggregateSession';
import { sessionCommandJournalDrizzleSchema } from '@zerospin/core/session/sessionCommandShape';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { ZerospinError } from '@zerospin/error';
import { Effect, Exit, Layer, ManagedRuntime, Schema, Scope } from 'effect';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { CartItemQuantityControls } from '@/components/CartItemQuantityControls';
import { ProductList } from '@/components/ProductList';
import {
  ClerkUserIdSchema,
  userV1,
} from '@/zerospin/aggregates/shopper/models/user/UserV1';
import { productV1 } from '@/zerospin/services/app/models/product/ProductV1';
import { Shopper } from '@/zerospin/ZerospinApp';

const WebV2 = { ...Shopper, systemName: 'shopping' as const };

const guardTestRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);

const sessionScope = Scope.makeUnsafe();
Effect.runSync(
  Scope.addFinalizer(sessionScope, guardTestRuntime.disposeEffect),
);
afterAll(() => Effect.runPromise(Scope.close(sessionScope, Exit.void)));

const useLiveQuery = vi.hoisted(() => vi.fn());
const executeAggregateFrontendCommand = vi.hoisted(() => vi.fn());
const shopperSessionRef = vi.hoisted(() => ({
  current: null as ReturnType<typeof makeAggregateSession<typeof WebV2>> | null,
}));
const catalogSessionRef = vi.hoisted(() => ({
  current: {
    // Stable session identity for the mocked useLiveQuery branch; store is unused.
    store: {
      getState: () => ({
        isInitialized: true,
        authentication: null,
        db: null,
      }),
      setState: () => {},
      subscribe: () => () => {},
    },
  },
}));

vi.hoisted(() => {
  process.env.ZEROSPIN_PUBLISHABLE_KEY = 'pk_test';
});

vi.mock('@zerospin/react', async importOriginal => ({
  ...(await importOriginal<typeof import('@zerospin/react')>()),
  useLiveQuery,
}));

vi.mock('@/zerospin/ZerospinApp', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/zerospin/ZerospinApp')>();
  return {
    ...actual,
    get shopperSession() {
      const session = shopperSessionRef.current;
      if (session === null) {
        throw new Error('shopperSession fixture was not initialized');
      }
      return session;
    },
    get catalogSession() {
      return catalogSessionRef.current;
    },
  };
});

const clerkUserId = Schema.decodeUnknownSync(ClerkUserIdSchema)('test');
const userRowId = prefixId(userV1, clerkUserId);
const now = new Date('2026-01-01T00:00:00.000Z');

describe('ProductList', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    executeAggregateFrontendCommand.mockReset();
    executeAggregateFrontendCommand.mockImplementation(props =>
      Effect.succeed({ commandId: props.command.id }),
    );
    const session = Effect.runSync(
      Effect.map(initializeFrontendGuards({ frontend: WebV2 }), guards => {
        const next = makeAggregateSession({ frontend: WebV2 });
        next.setExecutionResources({
          runtime: guardTestRuntime,
          guards,
          sessionId: 'sesn_product_list',
          executeAggregateFrontendCommand,
        });
        return next;
      }).pipe(Effect.provideService(Scope.Scope, sessionScope)),
    );
    shopperSessionRef.current = session;
    await Effect.runPromise(
      Effect.gen(function* () {
        const models = getFrontendDbModels(session.frontend);
        const dbConfig = makeResourceDbConfig({
          models,
          otherTables: sessionRepoTables,
        });
        const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
        yield* applyAggregateFrontendState({
          db,
          frontend: session.frontend,
          sessionId: session.sessionId!,
          models,
          aggregateId: 'acct_1',
          authentication: { clerkUserId, aggregateId: 'acct_1' },
          systemId: 'sys_test',
          frontendState: {
            aggregateId: 'acct_1',
            aggregateName: WebV2.aggregateName,
            authentication: { clerkUserId, aggregateId: 'acct_1' },
            frontendName: WebV2.name,
            userIndex: 0,
            systemId: 'sys_test',
            aggregateIndex: 0,
            aggregateVersion: WebV2.aggregateVersion,
            resolutions: [],
            resources: [
              {
                id: userRowId,
                clerkUserId,
                modelName: userV1.modelName,
                version: userV1.version,
                createdAt: now,
                updatedAt: now,
                name: null,
              },
            ],
          },
        });
        session.store.setState({
          aggregateId: 'acct_1',
          aggregateName: WebV2.aggregateName,
          authentication: { clerkUserId, aggregateId: 'acct_1' },
          frontendName: WebV2.name,
          systemId: 'sys_test',
          aggregateFrontendLockKey: 'a'.repeat(64),
          db,
          schema: dbConfig.schema,
          models,
          isInitialized: true,
          aggregateIndex: 0,
          userIndex: 0,
          pushIndex: 0,
          sessionStatus: 'current',
          backupState: { status: 'ready', failure: null },
        });
      }).pipe(Effect.provide(AsyncLive)),
    );
    useLiveQuery.mockImplementation(props => {
      if (props.session === catalogSessionRef.current) {
        return {
          data: [
            {
              id: prefixId(productV1, 'test'),
              modelName: productV1.modelName,
              version: productV1.version,
              createdAt: now,
              updatedAt: now,
              description: 'Test product',
              name: 'Test Product',
              price: 20,
            },
          ],
        };
      }
      if (String(props.query).includes('.user.')) {
        return {
          data: {
            id: userRowId,
            clerkUserId,
            modelName: userV1.modelName,
            version: userV1.version,
            createdAt: now,
            updatedAt: now,
            name: null,
          },
        };
      }
      return { data: undefined };
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    container.remove();
    shopperSessionRef.current = null;
    vi.restoreAllMocks();
  });

  it('reads products from the service replica and stages aggregate cart commands', async () => {
    await act(async () => {
      root.render(<ProductList />);
      await Promise.resolve();
    });

    const button = await waitFor(
      () => {
        const element = container.querySelector('button');
        expect(element).not.toBeNull();
        expect(container.textContent).toContain('Test Product');
        return element;
      },
      { timeout: 15_000 },
    );

    await act(async () => {
      button?.click();
      await Promise.resolve();
    });

    const executedCommands = await waitFor(() => {
      expect(executeAggregateFrontendCommand).toHaveBeenCalledTimes(2);
      return executeAggregateFrontendCommand.mock.calls.map(
        call => call[0].command,
      );
    });

    expect(executedCommands.map(command => command.commandName).sort()).toEqual(
      ['addToCart', 'createCart'],
    );
    const createCartCommand = executedCommands.find(
      command => command.commandName === 'createCart',
    );
    const addToCartCommand = executedCommands.find(
      command => command.commandName === 'addToCart',
    );
    expect(createCartCommand).toBeDefined();
    expect(addToCartCommand).toBeDefined();
    expect(JSON.parse(createCartCommand?.payload ?? '{}')).toMatchObject({
      userId: userRowId,
    });
    expect(JSON.parse(addToCartCommand?.payload ?? '{}')).toMatchObject({
      amount: 1,
      product: expect.stringContaining('prd_test'),
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it.each<'createCart' | 'addToCart'>(['createCart', 'addToCart'])(
    'shows a journaled %s failure and stops the success path',
    async contractName => {
      vi.spyOn(
        Shopper.contracts[contractName].contract,
        'program',
      ).mockReturnValue(
        Effect.fail(
          new ZerospinError({
            code: 'cart-rejected',
            message: 'Cart rejected',
          }),
        ),
      );

      await act(async () => {
        root.render(<ProductList />);
      });
      await act(async () => {
        container.querySelector('button')?.click();
      });

      expect(container.querySelector('[role="alert"]')?.textContent).toBe(
        'Cart rejected',
      );
      const state = shopperSessionRef.current?.store.getState();
      if (!state?.isInitialized)
        throw new Error('Expected initialized session');
      const rows = state.db
        .select()
        .from(sessionCommandJournalDrizzleSchema)
        .all();
      expect(rows).toHaveLength(contractName === 'createCart' ? 1 : 2);
      expect(JSON.parse(rows.at(-1)?.command ?? '{}')).toMatchObject({
        commandName: contractName,
        failure: { code: 'cart-rejected' },
      });
      await waitFor(() => {
        expect(executeAggregateFrontendCommand).toHaveBeenCalledTimes(
          rows.length,
        );
      });
    },
  );

  it('shows a readiness failure without staging either cart command', async () => {
    shopperSessionRef.current?.store.setState({ sessionStatus: 'superseded' });
    await act(async () => {
      root.render(<ProductList />);
    });
    await act(async () => {
      container.querySelector('button')?.click();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'requires a current session',
    );
    expect(executeAggregateFrontendCommand).not.toHaveBeenCalled();
  });

  it.each([
    { amount: 1, button: 0, contractName: 'removeFromCart' },
    { amount: 2, button: 0, contractName: 'updateCartItemQuantity' },
    { amount: 2, button: 1, contractName: 'updateCartItemQuantity' },
    { amount: 2, button: 2, contractName: 'removeFromCart' },
  ])(
    'shows a quantity-control failure for $contractName at button $button with amount $amount',
    async ({ amount, button }) => {
      shopperSessionRef.current?.store.setState({
        sessionStatus: 'superseded',
      });
      await act(async () => {
        root.render(
          <CartItemQuantityControls amount={amount} cartItemId="cit_test" />,
        );
      });
      await act(async () => {
        container.querySelectorAll('button')[button]?.click();
      });
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        'requires a current session',
      );
      expect(executeAggregateFrontendCommand).not.toHaveBeenCalled();
    },
  );
});
