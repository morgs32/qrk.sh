// @vitest-environment jsdom

import { act, useEffect } from 'react';

import { waitFor } from '@testing-library/react';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import type { IBrowserSession } from '@zerospin/react/types';
import { useSession } from '@zerospin/react/useSession';
import { Effect, Schema } from 'effect';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductList } from '@/components/ProductList';
import { catalogFrontend, shopperFrontend } from '@/zerospin/frontend';
import { ClerkUserIdSchema, Product, User } from '@/zerospin/models';
import { ZerospinApp } from '@/zerospin/ZerospinApp';

const acquireUserPartitionRepo = vi.hoisted(() => vi.fn());
const stageAggregateFrontendCommand = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
  process.env.ZEROSPIN_PUBLISHABLE_KEY = 'pk_test';
});

vi.mock('@zerospin/shared-worker/acquireUserPartitionRepo', () => ({
  acquireUserPartitionRepo,
}));
const clerkUserId = Schema.decodeUnknownSync(ClerkUserIdSchema)('test');
const userRowId = User.prefixId(clerkUserId);
const now = new Date('2026-01-01T00:00:00.000Z');

async function waitForSessionReady(props: {
  getSession: () => IBrowserSession<
    (typeof ZerospinApp.frontends.web)['frontend']
  > | null;
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
  onSession: (
    session: IBrowserSession<(typeof ZerospinApp.frontends.web)['frontend']>,
  ) => void;
}) {
  const session = useSession(ZerospinApp.frontends.web);
  const { onSession } = props;

  useEffect(() => {
    onSession(session);
  }, [onSession, session]);

  return null;
}

describe('ProductList', () => {
  let container: HTMLDivElement;
  let root: Root;
  let capturedSession: IBrowserSession<
    (typeof ZerospinApp.frontends.web)['frontend']
  > | null;

  beforeEach(() => {
    stageAggregateFrontendCommand.mockReset();
    stageAggregateFrontendCommand.mockImplementation(async props =>
      encodeRight({ commandId: props.command.id, replicaIndex: 1 }),
    );
    acquireUserPartitionRepo.mockReturnValue(
      Effect.succeed({
        api: {
          acquireAggregateFrontendReplica: vi.fn(async props =>
            encodeRight({
              getState: vi.fn(async () =>
                encodeRight({
                  aggregateId: 'acct_1',
                  aggregateName: shopperFrontend.aggregateName,
                  userId: clerkUserId,
                  frontendName: shopperFrontend.frontendName,
                  frontendIndex: 0,
                  systemId: 'sys_test',
                  systemVersion: '1.1.0',
                  aggregateFrontendLockKey: props.aggregateFrontendLockKey,
                  replicaIndex: 0,
                  lastRebasedPushedCursor: null,
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
                  stagedCommands: [],
                  pushedCommands: [],
                  failedStagedCommands: [],
                  optimisticAppliedMutations: [],
                  executedPushedCommands: [],
                  failedPushedCommands: [],
                }),
              ),
              release: vi.fn(async () => encodeRight(undefined)),
            }),
          ),
          acquireServiceFrontendReplica: vi.fn(async props =>
            encodeRight({
              getState: vi.fn(async () =>
                encodeRight({
                  userId: clerkUserId,
                  frontendName: catalogFrontend.frontendName,
                  frontendIndex: 0,
                  serviceName: catalogFrontend.serviceName,
                  systemId: 'sys_test',
                  systemVersion: '1.1.0',
                  serviceFrontendLockKey: props.serviceFrontendLockKey,
                  replicaIndex: 0,
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
              ),
              release: vi.fn(async () => encodeRight(undefined)),
            }),
          ),
          stageAggregateFrontendCommand,
          listAggregateFrontendReplicas: vi.fn(async () => encodeRight([])),
          listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
        },
        release: Effect.void,
        systemId: 'sys_test',
        userId: clerkUserId,
        mode: 'online',
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
  });

  it('reads products from the service replica and stages aggregate cart commands', async () => {
    await act(async () => {
      root.render(
        <ZerospinApp.Provider
          aggregateIds={{ shopper: 'acct_1' }}
          generateSignature={() => Effect.succeed({ clerkUserId })}
        >
          <SessionCapture
            onSession={session => {
              capturedSession = session;
            }}
          />
          <ProductList />
        </ZerospinApp.Provider>,
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

    const stagedCommands = await waitFor(() => {
      expect(stageAggregateFrontendCommand).toHaveBeenCalledTimes(2);
      return stageAggregateFrontendCommand.mock.calls.map(
        call => call[0].command,
      );
    });

    expect(stagedCommands.map(command => command.commandName).sort()).toEqual([
      'addToCart',
      'createCart',
    ]);
    const createCartCommand = stagedCommands.find(
      command => command.commandName === 'createCart',
    );
    const addToCartCommand = stagedCommands.find(
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
