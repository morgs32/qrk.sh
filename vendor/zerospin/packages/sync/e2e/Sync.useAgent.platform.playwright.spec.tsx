import { useEffect } from 'react';

import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import { useAgent, type UseAgentOptions } from 'agents/react';
import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render as _render, cleanup } from 'vitest-browser-react';

import {
  getTestWorkerHost,
  getTestWorkerUrl,
} from '../vitest.playwright.test-config.js';

import type { ISyncState } from './FixtureSyncAgent.js';
import type { FixtureSyncRpcApi } from './FixtureSyncRpcApi.js';

type TestAgent = ReturnType<typeof useAgent<ISyncState>>;

const render: typeof _render = async (...args) => {
  const result = await _render(...args);
  // @ts-expect-error - globalThis is not typed
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  return result;
};

afterEach(() => {
  cleanup();
});

function StateTrackingComponent({
  options,
  onAgent,
}: {
  options: UseAgentOptions<ISyncState>;
  onAgent: (agent: TestAgent) => void;
}) {
  const agent = useAgent<ISyncState>(options);

  useEffect(() => {
    onAgent(agent);
  }, [agent, agent.identified, agent.state, onAgent]);

  return (
    <div>
      <div data-testid="agent-status">
        {agent.identified ? 'connected' : 'connecting'}
      </div>
      <div data-testid="agent-state">
        {agent.state === undefined ? 'undefined' : JSON.stringify(agent.state)}
      </div>
    </div>
  );
}

const bumpViaRpc = async (props: { name: string; value: string }) => {
  using api = newSyncRpcSession<FixtureSyncRpcApi>(`${getTestWorkerUrl()}/rpc`);
  return Effect.runPromise(decodeRpc(await api.bump(props)));
};

describe('Sync useAgent hook (platform browser)', () => {
  it('connects and receives initial agent.state', async () => {
    const { host, protocol } = getTestWorkerHost();
    const name = `platform-useagent-initial-${Date.now()}`;

    const { container } = await render(
      <StateTrackingComponent
        options={{
          agent: 'FixtureSyncAgent',
          basePath: `ws/sync/${name}`,
          host,
          protocol,
          query: { mode: 'view' },
        }}
        onAgent={() => {}}
      />,
    );

    await vi.waitFor(
      () => {
        expect(
          container.querySelector('[data-testid="agent-status"]')?.textContent,
        ).toBe('connected');
        const stateEl = container.querySelector('[data-testid="agent-state"]');
        expect(stateEl?.textContent).not.toBe('undefined');
        const rendered = JSON.parse(stateEl!.textContent!) as ISyncState;
        expect(rendered.snapshot.version).toBe(0);
      },
      { timeout: 15_000 },
    );
  });

  it('readonly hook receives server push after capnweb bump', async () => {
    const { host, protocol } = getTestWorkerHost();
    const name = `platform-useagent-readonly-bump-${Date.now()}`;
    let capturedAgent: TestAgent | null = null;

    const { container } = await render(
      <StateTrackingComponent
        options={{
          agent: 'FixtureSyncAgent',
          basePath: `ws/sync/${name}`,
          host,
          protocol,
          query: { mode: 'view' },
        }}
        onAgent={agent => {
          capturedAgent = agent;
        }}
      />,
    );

    await vi.waitFor(
      () => {
        expect(capturedAgent?.identified).toBe(true);
        const stateEl = container.querySelector('[data-testid="agent-state"]');
        expect(stateEl?.textContent).not.toBe('undefined');
      },
      { timeout: 15_000 },
    );

    const bumped = await bumpViaRpc({ name, value: 'first' });

    await vi.waitFor(
      () => {
        const stateEl = container.querySelector('[data-testid="agent-state"]');
        const rendered = JSON.parse(stateEl!.textContent!) as ISyncState;
        expect(rendered.snapshot.version).toBe(1);
        expect(rendered.snapshot).toEqual(bumped);
        expect(capturedAgent?.state?.snapshot.version).toBe(1);
      },
      { timeout: 15_000 },
    );
  });

  it('readonly agent.setState fires onStateUpdateError and bump still advances', async () => {
    const { host, protocol } = getTestWorkerHost();
    const name = `platform-useagent-readonly-blocked-${Date.now()}`;
    const onStateUpdateError = vi.fn();
    let capturedAgent: TestAgent | null = null;

    const { container } = await render(
      <StateTrackingComponent
        options={{
          agent: 'FixtureSyncAgent',
          basePath: `ws/sync/${name}`,
          host,
          protocol,
          query: { mode: 'view' },
          onStateUpdateError,
        }}
        onAgent={agent => {
          capturedAgent = agent;
        }}
      />,
    );

    await vi.waitFor(
      () => {
        expect(capturedAgent?.identified).toBe(true);
        const stateEl = container.querySelector('[data-testid="agent-state"]');
        expect(stateEl?.textContent).not.toBe('undefined');
      },
      { timeout: 15_000 },
    );

    const initial = capturedAgent!.state!;
    expect(initial.snapshot.version).toBe(0);

    capturedAgent!.setState({
      snapshot: { version: 999, value: 'hacked' },
      syncedAt: Date.now(),
    });

    await vi.waitFor(
      () => {
        expect(onStateUpdateError).toHaveBeenCalledWith(
          expect.stringContaining('readonly'),
        );
      },
      { timeout: 15_000 },
    );

    const bumped = await bumpViaRpc({ name, value: 'still-authoritative' });

    await vi.waitFor(
      () => {
        const stateEl = container.querySelector('[data-testid="agent-state"]');
        const rendered = JSON.parse(stateEl!.textContent!) as ISyncState;
        expect(rendered.snapshot.version).toBe(initial.snapshot.version + 1);
        expect(rendered.snapshot).toEqual(bumped);
        expect(rendered.snapshot.version).not.toBe(999);
      },
      { timeout: 15_000 },
    );
  });

  it('writable hook still receives server push after capnweb bump', async () => {
    const { host, protocol } = getTestWorkerHost();
    const name = `platform-useagent-writable-${Date.now()}`;
    let capturedAgent: TestAgent | null = null;

    const { container } = await render(
      <StateTrackingComponent
        options={{
          agent: 'FixtureSyncAgent',
          basePath: `ws/sync/${name}`,
          host,
          protocol,
        }}
        onAgent={agent => {
          capturedAgent = agent;
        }}
      />,
    );

    await vi.waitFor(
      () => {
        expect(capturedAgent?.identified).toBe(true);
        const stateEl = container.querySelector('[data-testid="agent-state"]');
        expect(stateEl?.textContent).not.toBe('undefined');
      },
      { timeout: 15_000 },
    );

    const bumped = await bumpViaRpc({ name, value: 'writable' });

    await vi.waitFor(
      () => {
        const stateEl = container.querySelector('[data-testid="agent-state"]');
        const rendered = JSON.parse(stateEl!.textContent!) as ISyncState;
        expect(rendered.snapshot.version).toBe(1);
        expect(rendered.snapshot).toEqual(bumped);
      },
      { timeout: 15_000 },
    );
  });
});
