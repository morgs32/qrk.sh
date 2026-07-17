import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import { SELF } from 'cloudflare:test';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import type { ISyncState } from './FixtureSyncAgent.js';
import type { FixtureSyncRpcApi } from './FixtureSyncRpcApi.js';

const RPC_URL = 'http://sync.invalid/rpc';

type IAgentStateMessage = Readonly<{
  type: 'cf_agent_state';
  state: ISyncState;
}>;

type IAgentStateErrorMessage = Readonly<{
  type: 'cf_agent_state_error';
  error: string;
}>;

const openSyncSocket = async (name: string, query = 'mode=view') => {
  const response = await SELF.fetch(
    `http://sync.invalid/ws/sync/${encodeURIComponent(name)}?${query}`,
    {
      headers: { Upgrade: 'websocket' },
    },
  );
  expect(response.status).toBe(101);
  expect(response.webSocket).not.toBeNull();
  response.webSocket!.accept();
  return response.webSocket!;
};

const nextJsonMessage = async (socket: WebSocket, timeoutMs = 5_000) =>
  new Promise<MessageEvent<string>>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('websocket message timeout')),
      timeoutMs,
    );
    socket.addEventListener(
      'message',
      event => {
        clearTimeout(timeout);
        resolve(event as MessageEvent<string>);
      },
      { once: true },
    );
  });

const nextProtocolState = async (socket: WebSocket) => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const message = await nextJsonMessage(socket, 1_000);
    const parsed = JSON.parse(message.data) as { type: string };
    if (parsed.type === 'cf_agent_state') {
      return parsed as IAgentStateMessage;
    }
  }
  throw new Error('cf_agent_state not received');
};

const nextProtocolStateError = async (socket: WebSocket) => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const message = await nextJsonMessage(socket, 1_000);
    const parsed = JSON.parse(message.data) as { type: string };
    if (parsed.type === 'cf_agent_state_error') {
      return parsed as IAgentStateErrorMessage;
    }
  }
  throw new Error('cf_agent_state_error not received');
};

describe('Sync Agents readonly DO mirror (workerd)', () => {
  it('reaches the worker capnweb gateway', async () => {
    using api = newSyncRpcSession<FixtureSyncRpcApi>(RPC_URL);
    expect(await api.ping()).toBe('pong');
  });

  it('readonly websocket receives cf_agent_state when capnweb bump updates the repo', async () => {
    const name = 'readonly-mirror';
    const socket = await openSyncSocket(name);

    try {
      await nextProtocolState(socket);

      const bumpPromise = nextProtocolState(socket);
      using api = newSyncRpcSession<FixtureSyncRpcApi>(RPC_URL);
      const bumped = await Effect.runPromise(
        decodeRpc(await api.bump({ name, value: 'first' })),
      );
      const stateMessage = await bumpPromise;

      expect(bumped.version).toBe(1);
      expect(stateMessage.state.snapshot).toEqual(bumped);
    } finally {
      socket.close();
    }
  });

  it('readonly websocket rejects client cf_agent_state updates', async () => {
    const name = 'readonly-blocked';
    const socket = await openSyncSocket(name);

    try {
      const initial = await nextProtocolState(socket);

      socket.send(
        JSON.stringify({
          type: 'cf_agent_state',
          state: {
            snapshot: { version: 999, value: 'hacked' },
            syncedAt: Date.now(),
          },
        }),
      );

      const errorMessage = await nextProtocolStateError(socket);
      expect(errorMessage.error).toContain('readonly');

      const bumpPromise = nextProtocolState(socket);
      using api = newSyncRpcSession<FixtureSyncRpcApi>(RPC_URL);
      const bumped = await Effect.runPromise(
        decodeRpc(await api.bump({ name, value: 'still-authoritative' })),
      );
      const stateMessage = await bumpPromise;

      expect(bumped.version).toBe(initial.state.snapshot.version + 1);
      expect(stateMessage.state.snapshot).toEqual(bumped);
      expect(stateMessage.state.snapshot.version).not.toBe(999);
    } finally {
      socket.close();
    }
  });

  it('writable websocket still receives cf_agent_state on bump', async () => {
    const name = 'writable-mirror';
    const socket = await openSyncSocket(name, 'mode=edit');

    try {
      await nextProtocolState(socket);

      const bumpPromise = nextProtocolState(socket);
      using api = newSyncRpcSession<FixtureSyncRpcApi>(RPC_URL);
      const bumped = await Effect.runPromise(
        decodeRpc(await api.bump({ name, value: 'writable' })),
      );
      const stateMessage = await bumpPromise;

      expect(bumped.version).toBe(1);
      expect(stateMessage.state.snapshot).toEqual(bumped);
    } finally {
      socket.close();
    }
  });
});
