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

  it('renders root-aware account, service, and quarantined legacy listings', async () => {
    await act(async () => {
      root.render(<SharedWorkerRoute />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      'No SharedWorker roots are registered by ZerospinConfig.',
    );

    const listAccountFrontendReplicas = vi.fn(async () => ({
      _tag: 'Right',
      right: [
        {
          accountId: 'acct_1',
          accountName: 'main',
          actorId: 'actr_1',
          actorName: 'user',
          frontendName: 'app',
          frontendVersion: '1.0.0',
          databaseName: 'account.db',
          status: 'ready',
          role: 'active',
          frontendIndex: 7,
          replicaIndex: 9,
          activeProviderCount: 2,
          socketState: 'online',
          reconnectAttempt: 0,
          journalHealth: 'healthy',
          hasPendingTransition: false,
          lastFailure: null,
        },
      ],
    }));
    const listServiceFrontendReplicas = vi.fn(async () => ({
      _tag: 'Right',
      right: [
        {
          serviceName: 'catalog',
          actorId: 'actr_2',
          actorName: 'product',
          frontendName: 'browse',
          frontendVersion: '2.0.0',
          databaseName: 'service.db',
          status: 'commissioning',
          role: 'commissioned',
          frontendIndex: 4,
          replicaIndex: 5,
          activeProviderCount: 1,
          socketState: 'replaying',
          reconnectAttempt: 3,
          pendingTransition: {
            kind: 'lineage-transition-required',
            systemId: 'sys_1',
            generationId: 'gen_2',
            serviceName: 'catalog',
            actorId: 'actr_2',
            actorName: 'product',
            frontendName: 'browse',
            frontendVersion: '2.0.0',
            appliedBoundaryIndex: 4,
            remainingBoundaries: [],
          },
          lastFailure: null,
        },
      ],
    }));
    await act(async () => {
      zerospinDevtoolsStore.getState().addSharedWorkerRootDiagnostics({
        id: 'config-root',
        systemId: 'sys_1',
        generationId: 'gen_1',
        partitionKey: 'user_1',
        listAccountFrontendReplicas,
        listServiceFrontendReplicas,
      });
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('System: sys_1');
      expect(container.textContent).toContain('Account replicas (1)');
      expect(container.textContent).toContain('main/user/app');
      expect(container.textContent).toContain('Service replicas (1)');
      expect(container.textContent).toContain('catalog/product/browse');
      expect(container.textContent).toContain('commissioned');
      expect(container.textContent).toContain(
        'target gen_2/catalog/product/browse@2.0.0; boundary 4; remaining 0',
      );
      expect(container.textContent).toContain('healthy');
    });

    expect(listAccountFrontendReplicas).toHaveBeenCalledTimes(1);
    expect(listServiceFrontendReplicas).toHaveBeenCalledTimes(1);
  });
});
