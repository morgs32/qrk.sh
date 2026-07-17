import { ZerospinError } from '@zerospin/error';
import { env, runInDurableObject } from 'cloudflare:test';
import { sql } from 'drizzle-orm';
import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { managedRuntime } from '../managedRuntime.js';
import { getSystemLogRepo } from '../SystemLogRepo/getSystemLogRepo/getSystemLogRepo.js';
import {
  SystemLogRepo,
  systemLogRowSchema,
} from '../SystemLogRepo/SystemLogRepo.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';

describe('SystemLogAgent', () => {
  it('reconciles, broadcasts ordered bounded state, deduplicates retries, and rejects client writes', async () => {
    const deployId = 'dpl_system_log_agent';
    const generationId = 'gen_system_log_agent';
    const systemId = 'sys_local';
    await executeInRepo({
      managedRuntime,
      getRepo: getSystemLogRepo,
      repo: SystemLogRepo,
      key: { generationId },
      fn: ({ db, schema }) => {
        db.run(sql`
          WITH RECURSIVE sequence(value) AS (
            SELECT 1
            UNION ALL
            SELECT value + 1 FROM sequence WHERE value < 101
          )
          INSERT INTO ${schema.logs} (
            id, logIndex, createdAt, source, message, level,
            systemId, generationId, deployId, payload
          )
          SELECT
            printf('log_startup_%03d', value),
            value,
            value,
            'SystemLogAgent.workerd.spec',
            printf('startup-%03d', value),
            'info',
            ${systemId},
            ${generationId},
            ${deployId},
            NULL
          FROM sequence
        `);
      },
    });

    const systemLogRepoName = await managedRuntime.runPromise(
      SystemLogRepo.repoUtils.nameUtils.makeName({ generationId }),
    );
    const systemLogRepo = env.SYSTEM_LOG_REPO.getByName(systemLogRepoName);
    const systemLogAgent = env.SYSTEM_LOG_AGENT.getByName(generationId);
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
        name: generationId,
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
        deployId,
        level: 'warn',
        message: 'pushed',
        payload: { phase: 'push' },
        source: 'SystemLogAgent.workerd.spec',
      });
      const decodedPushedRow = Schema.decodeUnknownSync(
        Schema.Either({
          left: ZerospinError.schema,
          right: Schema.typeSchema(systemLogRowSchema),
        }),
      )(encodedPushedRow);
      if (Either.isLeft(decodedPushedRow)) {
        throw decodedPushedRow.left;
      }
      const pushedRow = decodedPushedRow.right;
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

  it('fails startup after reconciliation retries are exhausted', async () => {
    const deployId = 'dpl_system_log_agent_failure';
    const generationId = 'gen_system_log_agent_failure';
    const systemLogRepoName = await managedRuntime.runPromise(
      SystemLogRepo.repoUtils.nameUtils.makeName({ generationId }),
    );
    const systemLogRepo = env.SYSTEM_LOG_REPO.getByName(systemLogRepoName);
    const encodedRow = await systemLogRepo.appendLogRow({
      deployId,
      level: 'error',
      message: 'stale',
      payload: null,
      source: 'SystemLogAgent.workerd.spec',
    });
    const decodedRow = Schema.decodeUnknownSync(
      Schema.Either({
        left: ZerospinError.schema,
        right: Schema.typeSchema(systemLogRowSchema),
      }),
    )(encodedRow);
    if (Either.isLeft(decodedRow)) {
      throw decodedRow.left;
    }
    const staleRow = decodedRow.right;
    const systemLogAgent = env.SYSTEM_LOG_AGENT.getByName(generationId);

    await runInDurableObject(systemLogAgent, instance => {
      instance.setState({ rows: [staleRow], syncedAt: 1 });
    });
    await executeInRepo({
      managedRuntime,
      getRepo: getSystemLogRepo,
      repo: SystemLogRepo,
      key: { generationId },
      fn: ({ db, schema }) => {
        db.run(sql`DROP TABLE ${schema.logs}`);
      },
    });

    await expect(
      runInDurableObject(systemLogAgent, instance => instance.onStart()),
    ).rejects.toThrow();
  });
});
