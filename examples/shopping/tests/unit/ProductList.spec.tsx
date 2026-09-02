// @vitest-environment jsdom

import { act } from 'react';

import { waitFor } from '@testing-library/react';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { applyAggregateFrontendState } from '@zerospin/core/session/applyAggregateFrontendState';
import { makeSession } from '@zerospin/core/session/makeSession';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import { Effect, Schema } from 'effect';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductList } from '@/components/ProductList';
import { web as shopperFrontend } from '@/zerospin/frontends/web';
import { Product } from '@/zerospin/models/Product';
import { ClerkUserIdSchema, User } from '@/zerospin/models/User';
import { ZerospinApp } from '@/zerospin/ZerospinApp';

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
const userRowId = User.prefixId(clerkUserId);
const now = new Date('2026-01-01T00:00:00.000Z');

describe('ProductList', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    executeAggregateFrontendCommand.mockReset();
    executeAggregateFrontendCommand.mockImplementation(props =>
      Effect.succeed({ commandId: props.command.id }),
    );
    const session = makeSession({
      frontend: shopperFrontend,
      sessionId: 'sesn_product_list',
      executeAggregateFrontendCommand,
    });
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
          pushedCommands: [],
          frontendState: {
            aggregateId: 'acct_1',
            aggregateName: shopperFrontend.aggregateName,
            userId: clerkUserId,
            frontendName: shopperFrontend.frontendName,
            frontendIndex: 0,
            systemId: 'sys_test',
            systemVersion: '1.1.0',
            aggregateIndex: 0,
            pushIndex: 0,
            resolvedPushIndexes: [],
            resources: [
              {
                id: userRowId,
                clerkUserId,
                modelName: User.modelName,
                version: User.version,
                createdAt: now,
                updatedAt: now,
                name: null,
              },
            ],
          },
        });
        session.store.setState({
          aggregateId: 'acct_1',
          aggregateName: shopperFrontend.aggregateName,
          userId: clerkUserId,
          frontendName: shopperFrontend.frontendName,
          systemId: 'sys_test',
          systemVersion: '1.1.0',
          aggregateFrontendLockKey: 'a'.repeat(64),
          db,
          schema: dbConfig.schema,
          models,
          isInitialized: true,
          aggregateIndex: 0,
          frontendIndex: 0,
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
              id: Product.prefixId('test'),
              modelName: Product.modelName,
              version: Product.version,
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
            modelName: User.modelName,
            version: User.version,
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
      quantity: 1,
      product: expect.stringContaining('prd_test'),
    });
  });
});
