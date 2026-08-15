import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { zerospinDevtoolsStore } from '../zerospinDevtoolsStore.js';

import { SharedWorkerRoute } from './SharedWorkerRoute.js';

describe('SharedWorkerRoute', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    zerospinDevtoolsStore
      .getState()
      .removeSharedWorkerRootDiagnostics('config-root');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    zerospinDevtoolsStore
      .getState()
      .removeSharedWorkerRootDiagnostics('config-root');
    container.remove();
  });

  it('renders root-aware aggregate and service listings', async () => {
    await act(async () => {
      root.render(<SharedWorkerRoute />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      'No SharedWorker roots are registered by ZerospinApp.Provider.',
    );

    let pushInFlight = false;
    const listAggregateFrontendReplicas = vi.fn(async () => ({
      _tag: 'Right',
      right: [
        {
          aggregateId: 'acct_1',
          aggregateName: 'main',
          userId: 'user_1',
          frontendName: 'app',
          aggregateFrontendLockKey: 'a'.repeat(64),
          systemVersion: '1.0.0',
          databaseName: 'account.db',
          status: 'ready',
          frontendIndex: 7,
          replicaIndex: 9,
          activeRegistrationCount: 2,
          socketState: 'online',
          reconnectAttempt: 0,
          pushInFlight,
          lastFailure: null,
        },
      ],
    }));
    const listServiceFrontendReplicas = vi.fn(async () => ({
      _tag: 'Right',
      right: [
        {
          serviceName: 'catalog',
          userId: 'user_2',
          frontendName: 'browse',
          serviceFrontendLockKey: 'b'.repeat(64),
          systemVersion: '1.0.0',
          databaseName: 'service.db',
          status: 'activating',
          frontendIndex: 4,
          replicaIndex: 5,
          activeRegistrationCount: 1,
          socketState: 'replaying',
          reconnectAttempt: 3,
          lastFailure: null,
        },
      ],
    }));
    let pushPaused = false;
    const getPushPaused = vi.fn(async () => ({
      _tag: 'Right',
      right: pushPaused,
    }));
    const setPushPaused = vi.fn(async (props: { pushPaused: boolean }) => {
      pushPaused = props.pushPaused;
      pushInFlight = props.pushPaused;
      return {
        _tag: 'Right',
        right: undefined,
      };
    });
    const pushNow = vi.fn(async () => ({
      _tag: 'Right',
      right: { status: 'empty' },
    }));
    await act(async () => {
      zerospinDevtoolsStore.getState().addSharedWorkerRootDiagnostics({
        id: 'config-root',
        systemId: 'sys_1',
        userId: 'user_1',
        mode: 'existing-only',
        listAggregateFrontendReplicas,
        listServiceFrontendReplicas,
        getPushPaused,
        setPushPaused,
        pushNow,
      });
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('System: sys_1');
      expect(container.textContent).toContain('Mode: existing-only');
      expect(container.textContent).toContain('Aggregate replicas (1)');
      expect(container.textContent).toContain('sys_1/user_1/main/acct_1/app');
      expect(container.textContent).toContain('Service replicas (1)');
      expect(container.textContent).toContain('catalog/browse');
      expect(container.textContent).toContain('activating');
      expect(container.textContent).toContain('bbbbbbbbbbbb');
      expect(container.textContent).toContain('idle');
    });

    expect(listAggregateFrontendReplicas).toHaveBeenCalledTimes(1);
    expect(listServiceFrontendReplicas).toHaveBeenCalledTimes(1);
    expect(getPushPaused).toHaveBeenCalledWith({
      aggregateId: 'acct_1',
      aggregateName: 'main',
      frontendName: 'app',
      aggregateFrontendLockKey: 'a'.repeat(64),
    });

    const pauseButton = [...container.querySelectorAll('button')].find(
      button => button.textContent === 'Pause',
    );
    expect(pauseButton).toBeDefined();
    await act(async () => {
      pauseButton?.click();
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(setPushPaused).toHaveBeenCalledWith({
        aggregateId: 'acct_1',
        aggregateName: 'main',
        frontendName: 'app',
        aggregateFrontendLockKey: 'a'.repeat(64),
        pushPaused: true,
      });
      expect(container.textContent).toContain('Push now');
    });

    const pushNowButton = [...container.querySelectorAll('button')].find(
      button => button.textContent === 'Push now',
    );
    expect(pushNowButton?.disabled).toBe(true);
    pushInFlight = false;
    await vi.waitFor(() => expect(pushNowButton?.disabled).toBe(false));
    await act(async () => {
      pushNowButton?.click();
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(pushNow).toHaveBeenCalledWith({
        aggregateId: 'acct_1',
        aggregateName: 'main',
        frontendName: 'app',
        aggregateFrontendLockKey: 'a'.repeat(64),
      });
      expect(container.textContent).toContain('empty');
    });
  });
});
