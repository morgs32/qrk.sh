// @vitest-environment jsdom

import { act, useEffect } from 'react';

import { waitFor } from '@testing-library/react';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeServiceFrontendControllerSpec } from '@zerospin/core/serviceFrontendController/makeServiceFrontendControllerSpec';
import { sessionStagedCommandDrizzleSchema } from '@zerospin/core/session/sessionCommandShape';
import type { IBrowserSession } from '@zerospin/react/types';
import { useSession } from '@zerospin/react/useSession';
import { ZerospinConfig } from '@zerospin/react/ZerospinConfig';
import { Effect } from 'effect';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductList } from '@/app/(authed)/ProductList';
import { ZerospinCatalog } from '@/app/(authed)/ZerospinCatalog';
import { ZerospinShopper } from '@/app/(authed)/ZerospinShopper';
import { catalogFrontend, shopperFrontend } from '@/zerospin/frontend';
import { Product, User } from '@/zerospin/models';

const fetchFrontend = vi.hoisted(() => vi.fn());
const fetchFrontendState = vi.hoisted(() => vi.fn());
const acquireFrontendWebSocket = vi.hoisted(() => vi.fn());
const fetchServiceFrontend = vi.hoisted(() => vi.fn());
const fetchServiceFrontendState = vi.hoisted(() => vi.fn());
const acquireServiceFrontendWebSocket = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
  process.env.ZEROSPIN_PUBLISHABLE_KEY = 'pk_test';
});

vi.mock('@zerospin/frontend/fetchFrontend', () => ({ fetchFrontend }));
vi.mock('@zerospin/frontend/fetchFrontendState', () => ({
  fetchFrontendState,
}));
vi.mock('@zerospin/react/acquireFrontendWebSocket', () => ({
  acquireFrontendWebSocket,
}));
vi.mock('@zerospin/frontend/fetchServiceFrontend', () => ({
  fetchServiceFrontend,
}));
vi.mock('@zerospin/frontend/fetchServiceFrontendState', () => ({
  fetchServiceFrontendState,
}));
vi.mock('@zerospin/react/acquireServiceFrontendWebSocket', () => ({
  acquireServiceFrontendWebSocket,
}));

const clerkUserId = 'test';
const userId = User.prefixId(clerkUserId);
const actorId = 'actr_test';
const now = new Date('2026-01-01T00:00:00.000Z');

async function waitForSessionReady(props: {
  getSession: () => IBrowserSession<typeof shopperFrontend> | null;
}) {
  const { getSession } = props;
  await waitFor(
    () => {
      const session = getSession();
      expect(session).not.toBeNull();
      expect(session?.store.getState().isInitialized).toBe(true);
    },
    { timeout: 15_000 },
  );
}

function SessionCapture(props: {
  onSession: (session: IBrowserSession<typeof shopperFrontend>) => void;
}) {
  const session = useSession(ZerospinShopper);
  const { onSession } = props;

  useEffect(() => {
    onSession(session);
  }, [onSession, session]);

  return null;
}

describe('ProductList', () => {
  let container: HTMLDivElement;
  let root: Root;
  let capturedSession: IBrowserSession<typeof shopperFrontend> | null;

  beforeEach(() => {
    fetchFrontend.mockReturnValue(
      Effect.succeed({
        identity: {
          actor: { accountId: 'acct_1', actorId },
          accountId: 'acct_1',
          accountName: shopperFrontend.accountName,
          actorId,
          actorName: shopperFrontend.actorName,
          deployId: 'dpl_test',
          frontendName: shopperFrontend.frontendName,
          frontendVersion: shopperFrontend.version,
          generationId: 'gen_test',
          systemEnvironmentId: 'dev',
          systemId: 'sys_test',
          systemVersion: '1.1.0',
          systemWorkerName: 'shopping-test-worker',
        },
        frontendSpec: makeFrontendControllerSpec(shopperFrontend),
        frontendApi: {},
        releaseFrontendApi: vi.fn(),
      }),
    );
    fetchFrontendState.mockReturnValue(
      Effect.succeed({
        accountId: 'acct_1',
        accountName: shopperFrontend.accountName,
        actorId,
        actorName: shopperFrontend.actorName,
        frontendName: shopperFrontend.frontendName,
        frontendIndex: 0,
        generationId: 'gen_test',
        systemId: 'sys_test',
        systemVersion: '1.1.0',
        systemWorkerName: 'shopping-test-worker',
        lastRebasedPushedCursor: null,
        resources: [
          {
            id: userId,
            actorId,
            modelName: User.modelName,
            version: User.version,
            createdAt: now,
            updatedAt: now,
            name: null,
          },
        ],
        pushedCommands: [],
        executedPushedCommands: [],
        failedPushedCommands: [],
      }),
    );
    acquireFrontendWebSocket.mockReturnValue(Effect.succeed(Effect.void));

    fetchServiceFrontend.mockReturnValue(
      Effect.succeed({
        identity: {
          actorId,
          actorName: catalogFrontend.actorName,
          frontendName: catalogFrontend.frontendName,
          frontendVersion: catalogFrontend.version,
          generationId: 'gen_test',
          serviceName: catalogFrontend.serviceName,
          systemId: 'sys_test',
          systemVersion: '1.1.0',
          systemWorkerName: 'shopping-test-worker',
        },
        frontendSpec: makeServiceFrontendControllerSpec(catalogFrontend),
        frontendApi: {},
        releaseFrontendApi: vi.fn(),
      }),
    );
    fetchServiceFrontendState.mockReturnValue(
      Effect.succeed({
        actorId,
        actorName: catalogFrontend.actorName,
        frontendName: catalogFrontend.frontendName,
        frontendIndex: 0,
        generationId: 'gen_test',
        serviceName: catalogFrontend.serviceName,
        systemId: 'sys_test',
        systemVersion: '1.1.0',
        systemWorkerName: 'shopping-test-worker',
        resources: [
          {
            id: Product.prefixId('test'),
            modelName: Product.modelName,
            version: Product.version,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            description: 'Test product',
            name: 'Test Product',
            price: 20,
          },
        ],
      }),
    );
    acquireServiceFrontendWebSocket.mockReturnValue(
      Effect.succeed(Effect.void),
    );

    capturedSession = null;
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

  it('reads products from the service replica and stages account cart commands', async () => {
    await act(async () => {
      root.render(
        <ZerospinConfig
          partitionKey={clerkUserId}
          frontendAuthenticators={{
            web: {
              frontend: ZerospinShopper,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            catalog: {
              frontend: ZerospinCatalog,
              generateSignature: () =>
                Effect.succeed({ viewerId: clerkUserId }),
            },
          }}
        >
          <ZerospinShopper.Provider>
            <ZerospinCatalog.Provider>
              <SessionCapture
                onSession={session => {
                  capturedSession = session;
                }}
              />
              <ProductList />
            </ZerospinCatalog.Provider>
          </ZerospinShopper.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
    });

    await waitForSessionReady({ getSession: () => capturedSession });

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

    const sessionState = capturedSession?.store.getState();
    if (sessionState?.isInitialized !== true) {
      throw new Error('expected initialized account session');
    }
    const stagedRows = await waitFor(() => {
      const rows = sessionState.db
        .select()
        .from(sessionStagedCommandDrizzleSchema)
        .all()
        .filter(row => row.status === 'staged');
      expect(rows).toHaveLength(2);
      return rows;
    });

    expect(stagedRows.map(row => row.commandName).sort()).toEqual([
      'addToCart',
      'createCart',
    ]);
    const createCartRow = stagedRows.find(
      row => row.commandName === 'createCart',
    );
    const addToCartRow = stagedRows.find(
      row => row.commandName === 'addToCart',
    );
    expect(createCartRow).toBeDefined();
    expect(addToCartRow).toBeDefined();
    expect(JSON.parse(createCartRow?.payload ?? '{}')).toMatchObject({
      userId,
    });
    expect(JSON.parse(addToCartRow?.payload ?? '{}')).toMatchObject({
      quantity: 1,
      product: expect.stringContaining('prd_test'),
    });
  });
});
