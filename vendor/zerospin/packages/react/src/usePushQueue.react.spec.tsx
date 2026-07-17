import { act, useEffect } from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb';
import { main, mainModels } from '@zerospin/core/fixtures/system';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import type { IFrontendController } from '@zerospin/core/frontendController/types';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { makeSession } from '@zerospin/core/session/makeSession';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import type { ISessionId } from '@zerospin/core/session/types';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { Effect, Layer, ManagedRuntime, Queue, Redacted } from 'effect';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeBrowserSession } from './makeBrowserSession';
import { makeBrowserUserController } from './makeBrowserUserController';
import type { IBrowserSession } from './types';
import { usePushQueue } from './usePushQueue';

const pushStagedCommandsState = vi.hoisted(() => ({
  calls: 0,
  shouldFail: false,
}));

vi.mock('@zerospin/frontend/pushStagedCommands', () => ({
  pushStagedCommands: () => {
    pushStagedCommandsState.calls += 1;
    if (pushStagedCommandsState.shouldFail) {
      return Effect.fail(new Error('Expected manual push failure'));
    }
    return Effect.succeed({
      pendingCommands: [],
      pushedCommands: [],
      failedCommands: [],
    });
  },
}));

const frontend = makeFrontendController({
  contracts: {},
  models: {},
  accountName: 'user',
  actorName: 'shopper',
  frontendName: 'web',
  version: '1.0.0',
  systemName: 'push-queue-hook-test',
  signature: {},
});

const sessionRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    AsyncLive,
    NanoIdFactory,
    UlidMonotonicFactory,
    Layer.succeed(PublishableKey, Redacted.make('pk_test')),
    Layer.succeed(ZerospinApisUrl, 'https://api.example.com'),
  ),
);

function HookProbe<FRONTEND extends IFrontendController>(props: {
  session: IBrowserSession<FRONTEND>;
  pushQueue: Queue.Queue<number>;
  onReady: (pushStagedCommands: () => Promise<unknown>) => void;
  enabled?: boolean;
}) {
  const { enabled = true, onReady, pushQueue, session } = props;

  const { pushStagedCommands } = usePushQueue({
    session,
    pushQueue,
    sessionRuntime,
    enabled,
  });

  useEffect(() => {
    onReady(pushStagedCommands);
  }, [onReady, pushStagedCommands]);

  return null;
}

async function makeInitializedBrowserSession(props: {
  sessionId: ISessionId;
  userId: string;
  onCommandStaged?: () => void;
}) {
  const { onCommandStaged, sessionId, userId } = props;
  const dbConfig = makeResourceDbConfig({
    models: mainModels,
    otherTables: sessionRepoTables,
  });
  const { schema } = dbConfig;
  const db = await sessionRuntime.runPromise(
    makeMigratedInMemoryWasmSqliteDb({ dbConfig }),
  );
  const coreSession = makeSession({
    frontend: main,
    generateSignature: () => Effect.succeed({ actorId: 'act_1' }),
    sessionId,
    runtime: sessionRuntime,
  });
  const session = makeBrowserSession({
    session: coreSession,
    browserUserController: makeBrowserUserController(userId),
    onCommandStaged,
  });
  session.store.setState({
    sessionId,
    accountId: 'acct_1',
    accountName: main.accountName,
    actorId: 'usr_1',
    generationId: 'gen_1',
    systemVersion: '1.0.0',
    systemWorkerName: 'stub-deploy',
    db,
    schema,
    models: mainModels,
    vfsName: null,
    isInitialized: true,
    frontendIndex: null,
    lastRebasedPushedCursor: null,
  });
  return session;
}

describe('usePushQueue', () => {
  let container: HTMLDivElement;
  let didUnmount: boolean;
  let root: Root;

  beforeEach(() => {
    pushStagedCommandsState.calls = 0;
    pushStagedCommandsState.shouldFail = false;
    didUnmount = false;
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (!didUnmount) {
      await act(async () => {
        root.unmount();
        didUnmount = true;
        await Promise.resolve();
      });
    }
    container.remove();
  });

  it('does not auto-flush when isPushPaused is true', async () => {
    const sessionId = 'sesn_paused' as ISessionId;
    const coreSession = makeSession({
      frontend,
      generateSignature: () => Effect.succeed({ actorId: 'act_1' }),
      sessionId,
      runtime: sessionRuntime,
    });
    const session = makeBrowserSession({
      session: coreSession,
      browserUserController: makeBrowserUserController('user_paused'),
    });
    session.store.setState({ isPushPaused: true });
    const pushQueue = sessionRuntime.runSync(Queue.bounded<number>(1));

    await act(async () => {
      root.render(
        <HookProbe
          session={session}
          pushQueue={pushQueue}
          onReady={() => {}}
        />,
      );
      await Promise.resolve();
    });

    sessionRuntime.runFork(Queue.offer(pushQueue, Date.now()));
    await new Promise(resolve => setTimeout(resolve, 250));

    expect(pushStagedCommandsState.calls).toBe(0);
  });

  it('resumes flushing when isPushPaused is cleared', async () => {
    const sessionId = 'sesn_resume' as ISessionId;
    const coreSession = makeSession({
      frontend,
      generateSignature: () => Effect.succeed({ actorId: 'act_1' }),
      sessionId,
      runtime: sessionRuntime,
    });
    const session = makeBrowserSession({
      session: coreSession,
      browserUserController: makeBrowserUserController('user_resume'),
    });
    session.store.setState({ isPushPaused: true });
    const pushQueue = sessionRuntime.runSync(Queue.bounded<number>(1));

    await act(async () => {
      root.render(
        <HookProbe
          session={session}
          pushQueue={pushQueue}
          onReady={() => {}}
        />,
      );
      await Promise.resolve();
    });

    sessionRuntime.runFork(Queue.offer(pushQueue, Date.now()));
    await new Promise(resolve => setTimeout(resolve, 250));
    expect(pushStagedCommandsState.calls).toBe(0);

    const beforeResume = pushStagedCommandsState.calls;

    await act(async () => {
      session.store.setState({ isPushPaused: false });
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(pushStagedCommandsState.calls).toBeGreaterThan(beforeResume);
    });
  });

  it('returned pushStagedCommands runs while isPushPaused is true', async () => {
    const session = await makeInitializedBrowserSession({
      sessionId: 'sesn_manual' as ISessionId,
      userId: 'user_manual',
    });
    session.store.setState({ isPushPaused: true });
    const pushQueue = sessionRuntime.runSync(Queue.bounded<number>(1));
    let manuallyPushStagedCommands: () => Promise<unknown> = () => {
      throw new Error('Hook did not return pushStagedCommands');
    };

    await act(async () => {
      root.render(
        <HookProbe
          session={session}
          pushQueue={pushQueue}
          onReady={pushStagedCommands => {
            manuallyPushStagedCommands = pushStagedCommands;
          }}
        />,
      );
      await Promise.resolve();
    });

    sessionRuntime.runFork(Queue.offer(pushQueue, Date.now()));
    await new Promise(resolve => setTimeout(resolve, 250));
    expect(pushStagedCommandsState.calls).toBe(0);

    const result = await manuallyPushStagedCommands();

    expect(result).toEqual({
      pendingCommands: [],
      pushedCommands: [],
      failedCommands: [],
    });
    expect(pushStagedCommandsState.calls).toBe(1);
    expect(session.store.getState().lastDevtoolsPush).toEqual(
      expect.objectContaining({
        traceId: expect.stringMatching(/^trc_/),
        completedAt: expect.any(Number),
        status: 'ok',
      }),
    );
    expect(session.store.getState().telemetry.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          traceId: session.store.getState().lastDevtoolsPush?.traceId,
          name: 'devtools.pushStagedCommands',
          status: 'ok',
        }),
      ]),
    );
  });

  it('records and rethrows a failed manual push without enabling automatic push', async () => {
    const session = await makeInitializedBrowserSession({
      sessionId: 'sesn_manual_failure' as ISessionId,
      userId: 'user_manual_failure',
    });
    session.store.setState({ isPushPaused: true });
    pushStagedCommandsState.shouldFail = true;
    const pushQueue = sessionRuntime.runSync(Queue.bounded<number>(1));
    let manuallyPushStagedCommands: () => Promise<unknown> = () => {
      throw new Error('Hook did not return pushStagedCommands');
    };

    await act(async () => {
      root.render(
        <HookProbe
          session={session}
          pushQueue={pushQueue}
          onReady={pushStagedCommands => {
            manuallyPushStagedCommands = pushStagedCommands;
          }}
        />,
      );
      await Promise.resolve();
    });

    await expect(
      manuallyPushStagedCommands(),
    ).rejects.toThrowError('Expected manual push failure');

    expect(pushStagedCommandsState.calls).toBe(1);
    expect(session.store.getState().lastDevtoolsPush).toEqual(
      expect.objectContaining({
        traceId: expect.stringMatching(/^trc_/),
        completedAt: expect.any(Number),
        status: 'error',
      }),
    );
    expect(session.store.getState().telemetry.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          traceId: session.store.getState().lastDevtoolsPush?.traceId,
          name: 'devtools.pushStagedCommands',
          status: 'error',
        }),
      ]),
    );
  });

  it('imperative push before initialization throws synchronously and performs no push', async () => {
    const sessionId = 'sesn_preinit' as ISessionId;
    const coreSession = makeSession({
      frontend,
      generateSignature: () => Effect.succeed({ actorId: 'act_1' }),
      sessionId,
      runtime: sessionRuntime,
    });
    const session = makeBrowserSession({
      session: coreSession,
      browserUserController: makeBrowserUserController('user_preinit'),
    });
    const pushQueue = sessionRuntime.runSync(Queue.bounded<number>(1));
    let manuallyPushStagedCommands: () => Promise<unknown> = () => {
      throw new Error('Hook did not return pushStagedCommands');
    };

    await act(async () => {
      root.render(
        <HookProbe
          enabled={false}
          session={session}
          pushQueue={pushQueue}
          onReady={pushStagedCommands => {
            manuallyPushStagedCommands = pushStagedCommands;
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(() => {
      manuallyPushStagedCommands();
    }).toThrowError('Session store is not initialized');

    await new Promise(resolve => setTimeout(resolve, 250));
    expect(pushStagedCommandsState.calls).toBe(0);
  });

  it('notifies onCommandStaged only after successful browser staging', async () => {
    const onCommandStaged = vi.fn();
    const initializedSession = await makeInitializedBrowserSession({
      sessionId: 'sesn_stage_notification',
      userId: 'user_stage_notification',
      onCommandStaged,
    });

    const staged = await initializedSession.stageCommand({
      contractName: 'createList',
      payload: {
        id: 'lst_stage_notification',
        name: 'Stage notification',
        userId: 'usr_1',
      },
    });

    expect(staged._tag).toBe('Right');
    expect(onCommandStaged).toHaveBeenCalledTimes(1);

    const uninitializedCoreSession = makeSession({
      frontend: main,
      generateSignature: () => Effect.succeed({ actorId: 'act_1' }),
      sessionId: 'sesn_failed_stage_notification',
      runtime: sessionRuntime,
    });
    const uninitializedSession = makeBrowserSession({
      session: uninitializedCoreSession,
      browserUserController: makeBrowserUserController(
        'user_failed_stage_notification',
      ),
      onCommandStaged,
    });

    const failed = await uninitializedSession.stageCommand({
      contractName: 'createList',
      payload: {
        id: 'lst_failed_stage_notification',
        name: 'Failed stage notification',
        userId: 'usr_1',
      },
    });

    expect(failed._tag).toBe('Left');
    expect(onCommandStaged).toHaveBeenCalledTimes(1);
  });

  it('flushes queued push work on initial online mount', async () => {
    const sessionId = 'sesn_1' as ISessionId;
    const coreSession = makeSession({
      frontend,
      generateSignature: () => Effect.succeed({ actorId: 'act_1' }),
      sessionId,
      runtime: sessionRuntime,
    });
    const session = makeBrowserSession({
      session: coreSession,
      browserUserController: makeBrowserUserController('user_1'),
    });
    const pushQueue = sessionRuntime.runSync(Queue.bounded<number>(1));

    await act(async () => {
      root.render(
        <HookProbe
          session={session}
          pushQueue={pushQueue}
          onReady={() => {}}
        />,
      );
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(pushStagedCommandsState.calls).toBe(1);
    });
    expect(session.store.getState().lastDevtoolsPush).toBeNull();
  });

  it('does not flush queued push work while offline', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    const sessionId = 'sesn_2' as ISessionId;
    const coreSession = makeSession({
      frontend,
      generateSignature: () => Effect.succeed({ actorId: 'act_1' }),
      sessionId,
      runtime: sessionRuntime,
    });
    const session = makeBrowserSession({
      session: coreSession,
      browserUserController: makeBrowserUserController('user_2'),
    });
    const pushQueue = sessionRuntime.runSync(Queue.bounded<number>(1));

    await act(async () => {
      root.render(
        <HookProbe
          session={session}
          pushQueue={pushQueue}
          onReady={() => {}}
        />,
      );
      await Promise.resolve();
    });

    sessionRuntime.runFork(Queue.offer(pushQueue, Date.now()));
    await new Promise(resolve => setTimeout(resolve, 250));

    expect(pushStagedCommandsState.calls).toBe(0);
  });

  it('offers reconnect flush when the browser comes back online', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    const sessionId = 'sesn_3' as ISessionId;
    const coreSession = makeSession({
      frontend,
      generateSignature: () => Effect.succeed({ actorId: 'act_1' }),
      sessionId,
      runtime: sessionRuntime,
    });
    const session = makeBrowserSession({
      session: coreSession,
      browserUserController: makeBrowserUserController('user_3'),
    });
    const pushQueue = sessionRuntime.runSync(Queue.bounded<number>(1));

    await act(async () => {
      root.render(
        <HookProbe
          session={session}
          pushQueue={pushQueue}
          onReady={() => {}}
        />,
      );
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(pushStagedCommandsState.calls).toBe(1);
    });
  });

  it('stops the consumer on unmount', async () => {
    const sessionId = 'sesn_4' as ISessionId;
    const coreSession = makeSession({
      frontend,
      generateSignature: () => Effect.succeed({ actorId: 'act_1' }),
      sessionId,
      runtime: sessionRuntime,
    });
    const session = makeBrowserSession({
      session: coreSession,
      browserUserController: makeBrowserUserController('user_4'),
    });
    const pushQueue = sessionRuntime.runSync(Queue.bounded<number>(1));

    await act(async () => {
      root.render(
        <HookProbe
          session={session}
          pushQueue={pushQueue}
          onReady={() => {}}
        />,
      );
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(pushStagedCommandsState.calls).toBe(1);
    });

    pushStagedCommandsState.calls = 0;

    await act(async () => {
      root.unmount();
      didUnmount = true;
      await Promise.resolve();
    });

    sessionRuntime.runFork(Queue.offer(pushQueue, Date.now()));
    await new Promise(resolve => setTimeout(resolve, 250));

    expect(pushStagedCommandsState.calls).toBe(0);
  });
});
