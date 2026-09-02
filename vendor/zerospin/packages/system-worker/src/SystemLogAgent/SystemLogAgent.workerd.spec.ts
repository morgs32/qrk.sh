import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { RpcResultSchema } from '@zerospin/core/utils/encodeRpc';
import { ZerospinError } from '@zerospin/error';
import { env, runInDurableObject } from 'cloudflare:test';
import { Result, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { managedRuntime } from '../managedRuntime.js';
import { getSystemLogRepo } from '../SystemLogRepo/getSystemLogRepo/getSystemLogRepo.js';
import { systemLogRowSchema } from '../SystemLogRepo/SystemLogRepoDbConfig.js';

describe('SystemLogAgent', () => {
  it('reconciles, broadcasts ordered bounded state, deduplicates retries, and rejects client writes', async () => {
    const systemId = env.ZEROSPIN_SYSTEM_ID;
    const systemLogRepo = await managedRuntime.runPromise(
      getSystemLogRepo({ key: { systemId } }),
    );
    for (let value = 1; value <= 101; value += 1) {
      await managedRuntime.runPromise(
        decodeRpc(
          await systemLogRepo.appendLogRow({
            level: 'info',
            message: `startup-${value.toString().padStart(3, '0')}`,
            payload: null,
            source: 'SystemLogAgent.workerd.spec',
          }),
        ),
      );
    }
    const systemLogAgent = env.SYSTEM_LOG_AGENT.getByName(systemId);
    const response = await systemLogAgent.fetch(
      new Request('http://log-agent.invalid/ws', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    expect(response.status).toBe(101);
    expect(response.webSocket).not.toBeNull();
    if (response.webSocket === null) {
      throw new Error('SystemLogAgent did not return a WebSocket');
    }
    const socket = response.webSocket;
    socket.accept();

    try {
      const identityMessage = await new Promise<MessageEvent<string>>(
        (resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('identity message timeout'));
          }, 5_000);
          socket.addEventListener(
            'message',
            event => {
              clearTimeout(timeout);
              resolve(event);
            },
            { once: true },
          );
        },
      );
      expect(JSON.parse(identityMessage.data)).toEqual({
        agent: 'system-log-agent',
        name: systemId,
        type: 'cf_agent_identity',
      });

      const startupStateMessage = await new Promise<MessageEvent<string>>(
        (resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('startup state message timeout'));
          }, 5_000);
          socket.addEventListener(
            'message',
            event => {
              clearTimeout(timeout);
              resolve(event);
            },
            { once: true },
          );
        },
      );
      const startupState = JSON.parse(startupStateMessage.data);
      expect(startupState.type).toBe('cf_agent_state');
      expect(startupState.state.rows).toHaveLength(100);
      expect(startupState.state.rows[0]?.logIndex).toBe(101);
      expect(startupState.state.rows[99]?.logIndex).toBe(2);

      const mcpServersMessage = await new Promise<MessageEvent<string>>(
        (resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('MCP servers message timeout'));
          }, 5_000);
          socket.addEventListener(
            'message',
            event => {
              clearTimeout(timeout);
              resolve(event);
            },
            { once: true },
          );
        },
      );
      expect(JSON.parse(mcpServersMessage.data)).toEqual(
        expect.objectContaining({ type: 'cf_agent_mcp_servers' }),
      );

      const rejectedStateMessage = new Promise<MessageEvent<string>>(
        (resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('readonly state error timeout'));
          }, 5_000);
          socket.addEventListener(
            'message',
            event => {
              clearTimeout(timeout);
              resolve(event);
            },
            { once: true },
          );
        },
      );
      socket.send(
        JSON.stringify({
          state: { rows: [], syncedAt: 0 },
          type: 'cf_agent_state',
        }),
      );
      expect(JSON.parse((await rejectedStateMessage).data)).toEqual(
        expect.objectContaining({ type: 'cf_agent_state_error' }),
      );

      const encodedPushedRow = await systemLogRepo.appendLogRow({
        level: 'warn',
        message: 'pushed',
        payload: { phase: 'push' },
        source: 'SystemLogAgent.workerd.spec',
      });
      const decodedPushedRow = Schema.decodeUnknownSync(
        Schema.toType(Schema.Result(systemLogRowSchema, ZerospinError.schema)),
      )(Schema.decodeUnknownSync(RpcResultSchema)(encodedPushedRow));
      if (Result.isFailure(decodedPushedRow)) {
        throw decodedPushedRow.failure;
      }
      const pushedRow = decodedPushedRow.success;
      const pushedStateMessage = new Promise<MessageEvent<string>>(
        (resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('pushed state message timeout'));
          }, 5_000);
          socket.addEventListener(
            'message',
            event => {
              clearTimeout(timeout);
              resolve(event);
            },
            { once: true },
          );
        },
      );
      await systemLogAgent.pushLogRows([pushedRow]);
      await systemLogAgent.pushLogRows([pushedRow]);

      const pushedState = JSON.parse((await pushedStateMessage).data);
      expect(pushedState.type).toBe('cf_agent_state');
      expect(pushedState.state.rows).toHaveLength(100);
      expect(pushedState.state.rows[0]?.id).toBe(pushedRow.id);
      expect(pushedState.state.rows[0]?.logIndex).toBe(102);
      expect(pushedState.state.rows[99]?.logIndex).toBe(3);

      const idempotentState = await runInDurableObject(
        systemLogAgent,
        instance => instance.state,
      );
      expect(idempotentState.rows).toHaveLength(100);
      expect(idempotentState.rows[0]?.id).toBe(pushedRow.id);
      expect(idempotentState.rows[0]?.logIndex).toBe(102);
      expect(idempotentState.rows[99]?.logIndex).toBe(3);

      const reconciledState = await runInDurableObject(
        systemLogAgent,
        async instance => {
          instance.setState({
            rows: [
              {
                ...pushedRow,
                id: 'log_stale',
                logIndex: 9_999,
              },
            ],
            syncedAt: 1,
          });
          await instance.onStart();
          return instance.state;
        },
      );
      expect(reconciledState.rows).toHaveLength(100);
      expect(reconciledState.rows[0]?.id).toBe(pushedRow.id);
      expect(reconciledState.rows[0]?.logIndex).toBe(102);
      expect(reconciledState.rows[99]?.logIndex).toBe(3);
      expect(reconciledState.rows).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'log_stale', logIndex: 9_999 }),
        ]),
      );
    } finally {
      socket.close();
    }
  });

  it('fails startup when its Agent name is not a System id', async () => {
    const systemLogAgent = env.SYSTEM_LOG_AGENT.getByName('invalid-agent-name');

    await runInDurableObject(systemLogAgent, instance => {
      instance.setState({ rows: [], syncedAt: 1 });
    });

    await runInDurableObject(systemLogAgent, async instance => {
      await expect(instance.onStart()).rejects.toMatchObject({
        code: 'failed-to-decode-system-log-agent-system-id',
      });
    });
  });
});
