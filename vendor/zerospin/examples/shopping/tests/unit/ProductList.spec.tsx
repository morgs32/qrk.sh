import { act } from 'react';

import { waitFor } from '@testing-library/react';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
// @vitest-environment jsdom
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { applyAggregateFrontendState } from '@zerospin/core/session/applyAggregateFrontendState';
import { makeAggregateSession } from '@zerospin/core/session/makeAggregateSession';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
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

import { ProductList } from '@/components/ProductList';
import {
  ClerkUserIdSchema,
  userV1,
} from '@/zerospin/aggregates/shopper/models/user/userV1';
import { productV1 } from '@/zerospin/services/app/models/product/productV1';
import { ZerospinApp } from '@/zerospin/ZerospinApp';
const WebV2 = ZerospinApp.frontends.web.frontend;

const guardTestRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);

const sessionScope = Scope.makeUnsafe();
Effect.runSync(
  Scope.addFinalizer(sessionScope, guardTestRuntime.disposeEffect),
);
afterAll(() => Effect.runPromise(Scope.close(sessionScope, Exit.void)));

const useInitializedStateOrThrow = vi.hoisted(() => vi.fn());
const useLiveQuery = vi.hoisted(() => vi.fn());
const useSession = vi.hoisted(() => vi.fn());
const executeAggregateFrontendCommand = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
  process.env.ZEROSPIN_PUBLISHABLE_KEY = 'pk_test';
});

vi.mock('@zerospin/react', async importOriginal => ({
  ...(await importOriginal<typeof import('@zerospin/react')>()),
  useInitializedStateOrThrow,
  useLiveQuery,
  useSession,
}));
const clerkUserId = Schema.decodeUnknownSync(ClerkUserIdSchema)('test');
const userRowId = userV1.prefixId(clerkUserId);
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
      Effect.map(WebV2.initializeGuards, guards =>
        makeAggregateSession({
          runtime: guardTestRuntime,
          guards,
          frontend: WebV2,
          sessionId: 'sesn_product_list',
          executeAggregateFrontendCommand,
        }),
      ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
    );
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
          sessionId: session.sessionId,
          models,
          aggregateId: 'acct_1',
          userId: clerkUserId,
          systemId: 'sys_test',
          frontendState: {
            aggregateId: 'acct_1',
            aggregateName: WebV2.aggregateName,
            userId: clerkUserId,
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
          userId: clerkUserId,
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
    useInitializedStateOrThrow.mockReturnValue({ userId: clerkUserId });
    useSession.mockReturnValue(session);
    useLiveQuery.mockImplementation((selector, props) => {
      if (selector === ZerospinApp.frontends.catalog) {
        return {
          data: [
            {
              id: productV1.prefixId('test'),
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
  });

  it('reads products from the service replica and executes aggregate cart commands', async () => {
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
  });
});
