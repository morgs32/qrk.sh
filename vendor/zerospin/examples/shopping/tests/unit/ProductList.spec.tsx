// @vitest-environment jsdom

import { act, useEffect } from 'react';

import { waitFor } from '@testing-library/react';
import { sessionStagedCommandDrizzleSchema } from '@zerospin/core/session/sessionCommandShape';
import { mockFrontendApi } from '@zerospin/core/session/test-utils/mockFrontendApi';
import { ISession } from '@zerospin/core/session/types';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { useSession } from '@zerospin/react/useSession';
import { ZerospinConfig } from '@zerospin/react/ZerospinConfig';
import type * as Capnweb from 'capnweb';
import { Effect } from 'effect';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductList } from '@/app/(authed)/ProductList';
import { RequiredUserProvider } from '@/app/(authed)/RequiredUser';
import { ZerospinShopper } from '@/app/(authed)/ZerospinShopper';
import { shopperFrontend } from '@/zerospin/frontend';

const newHttpBatchRpcSessionMock = vi.hoisted(() => vi.fn());
const getFrontendApi = vi.hoisted(() => vi.fn());
const makeSharedWorkerSessionMock = vi.hoisted(() => vi.fn());
const useUser = vi.hoisted(() => vi.fn());
vi.hoisted(() => {
  process.env.ZEROSPIN_PUBLISHABLE_KEY = 'pk_test';
});

vi.mock('@clerk/nextjs', () => ({
  useUser,
}));

vi.mock('@zerospin/shared-worker/makeSharedWorkerSession', () => ({
  makeSharedWorkerSession: makeSharedWorkerSessionMock,
}));

vi.mock('capnweb', async importOriginal => {
  const actual = await importOriginal<typeof Capnweb>();
  return {
    ...actual,
    newHttpBatchRpcSession: newHttpBatchRpcSessionMock,
  };
});

const clerkUserId = 'test' as const;
const userId = 'usr_test' as const;
const actorId = 'actr_test' as const;
const now = new Date('2026-01-01T00:00:00.000Z');

async function waitForSessionReady(props: {
  getSession: () => ISession | null;
}) {
  const { getSession } = props;
  await waitFor(
    () => {
      const session = getSession();
      expect(session).not.toBeNull();
      expect(session!.store.getState().db).not.toBeNull();
    },
    { timeout: 15_000 },
  );
}

function SessionCapture(props: { onSession: (session: unknown) => void }) {
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
  let capturedSession: ISession | null;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', undefined);
    vi.mocked(mockFrontendApi.getFrontendState).mockImplementation(async () =>
      ({
        result: encodeRight({
          actorId,
          accountName: shopperFrontend.accountName,
          actorName: shopperFrontend.actorName,
          frontendName: shopperFrontend.frontendName,
          systemWorkerName: 'stub-deploy',
          frontendIndex: null,
          lastRebasedPushedCursor: null,
          resources: [],
          pushedCommands: [],
          executedPushedCommands: [],
          failedPushedCommands: [],
        }),
        link: null,
      }),
    );
    vi.mocked(mockFrontendApi.fetchActor).mockResolvedValue(
      {
        result: encodeRight({
          actor: {
            accountId: 'acct_1',
            actorId,
          },
          deployId: 'dpl_test',
          generationId: 'gen_test',
          systemId: 'sys_1',
          systemVersion: '1.0.0',
          systemWorkerName: 'stub-deploy',
          systemEnvironmentId: 'dev',
        }),
        link: null,
      },
    );
    vi.mocked(mockFrontendApi.executeActorQuery).mockResolvedValue(
      {
        result: encodeRight([
          {
            createdAt: now,
            description: 'Test product',
            id: 'prd_1',
            modelName: 'product',
            name: 'Test Product',
            price: 20,
            updatedAt: now,
            version: '1.0.0',
          },
        ]),
        link: null,
      },
    );
    useUser.mockReturnValue({
      isLoaded: true,
      user: {
        id: clerkUserId,
      },
    });
    getFrontendApi.mockImplementation(() => mockFrontendApi);
    newHttpBatchRpcSessionMock.mockReset();
    newHttpBatchRpcSessionMock.mockImplementation(() => ({
      getFrontendApi,
      [Symbol.dispose]: () => {
        /* Rpc session dispose (no-op in tests). */
      },
    }));
    makeSharedWorkerSessionMock.mockReset();
    makeSharedWorkerSessionMock.mockImplementation(() =>
      Effect.succeed({
        api: {
          getUserApi: vi.fn(async () => ({
            listFrontendReplicas: vi.fn(async () => []),
          })),
        },
        release: Effect.void,
      }),
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
    vi.unstubAllGlobals();
  });

  it('stages createCart and addToCart on Add to cart click', async () => {
    await act(async () => {
      root.render(
        <ZerospinConfig userId={clerkUserId}>
          <ZerospinShopper.Provider
            generateSignature={() => Effect.succeed({ clerkUserId })}
          >
            <SessionCapture
              onSession={session => {
                capturedSession = session as typeof capturedSession;
              }}
            />
          </ZerospinShopper.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
    });

    await act(async () => {
      await Effect.runPromise(Effect.void);
      await Promise.resolve();
    });

    await waitForSessionReady({ getSession: () => capturedSession });

    const sessionState = capturedSession!.store.getState();
    if (!sessionState.isInitialized) {
      throw new Error('expected initialized session');
    }
    const db = sessionState.db as {
      insert: (t: unknown) => {
        values: (v: Record<string, unknown>) => { run: () => void };
      };
      select: () => {
        from: (t: unknown) => { all: () => Array<Record<string, unknown>> };
      };
    };

    await act(async () => {
      db.insert(shopperFrontend.models.user.drizzleSchema)
        .values({
          actorId,
          createdAt: now,
          id: userId,
          modelName: 'user',
          name: null,
          pushedCursor: null,
          updatedAt: now,
          version: '1.0.0',
        })
        .run();
      await Promise.resolve();
    });

    await act(async () => {
      root.render(
        <ZerospinConfig userId={clerkUserId}>
          <ZerospinShopper.Provider
            generateSignature={() => Effect.succeed({ clerkUserId })}
          >
            <SessionCapture
              onSession={session => {
                capturedSession = session as typeof capturedSession;
              }}
            />
            <RequiredUserProvider
              user={
                { id: clerkUserId } as NonNullable<
                  ReturnType<typeof useUser>['user']
                >
              }
            >
              <ProductList />
            </RequiredUserProvider>
          </ZerospinShopper.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
    });

    const button = await waitFor(
      () => {
        const el = container.querySelector('button');
        expect(el).not.toBeNull();
        return el as HTMLButtonElement;
      },
      { timeout: 15_000 },
    );

    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    const stagedRows = await waitFor(() => {
      const rows = (
        db.select().from(sessionStagedCommandDrizzleSchema).all() as Array<{
          commandName: string;
          payload: string;
          status: string | null;
        }>
      ).filter(row => row.status === 'staged');
      expect(rows).toHaveLength(2);
      return rows;
    });
    expect(stagedRows).toHaveLength(2);
    expect(stagedRows.map(r => r.commandName).sort()).toEqual([
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

    const createCartPayload = JSON.parse(createCartRow!.payload) as {
      id: string;
      userId: string;
    };
    const addToCartPayload = JSON.parse(addToCartRow!.payload) as {
      cartId: string;
      product: string;
      quantity: number;
    };
    expect(createCartPayload).toMatchObject({
      userId,
    });
    expect(addToCartPayload).toMatchObject({
      cartId: createCartPayload.id,
      quantity: 1,
    });
    expect(JSON.parse(addToCartPayload.product)).toMatchObject({
      id: 'prd_1',
    });
  });
});
