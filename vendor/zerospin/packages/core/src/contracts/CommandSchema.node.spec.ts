import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { DeployConfigSchema } from '../system/ZerospinConfigSchema.ts';

import {
  DeploySeedCommandSchema,
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
  FailedStagedReplicaCommandSchema,
  FinalizedFailedStagedReplicaCommandSchema,
  PushBlockSchema,
  StagedReplicaCommandSchema,
  StagedSessionCommandSchema,
} from './CommandSchema.ts';

describe('CommandSchema', () => {
  it('decodes service commands in deploy seed schema', async () => {
    const serviceCommand = {
      id: 'cmd_service',
      commandName: 'createProduct',
      payload: {
        id: 'prd_seed',
      },
      contractVersion: '1.0.0',
      commandType: 'service',
      serviceName: 'app',
    };

    const seed = await Effect.runPromise(
      Schema.decodeUnknown(DeploySeedCommandSchema)(serviceCommand),
    );
    const deployConfig = await Effect.runPromise(
      Schema.decodeUnknown(DeployConfigSchema)({
        environmentId: 'dev',
        env: null,
        seeds: [serviceCommand],
      }),
    );

    expect(seed).toEqual(serviceCommand);
    expect(deployConfig.seeds).toEqual([serviceCommand]);
  });

  it('rejects legacy commands that provide version instead of contractVersion', async () => {
    await expect(
      Effect.runPromise(
        Schema.decodeUnknown(DeploySeedCommandSchema)({
          id: 'cmd_legacy_service',
          commandName: 'createProduct',
          payload: { id: 'prd_seed' },
          version: '1.0.0',
          commandType: 'service',
          serviceName: 'app',
        }),
      ),
    ).rejects.toThrow();
  });

  it('requires provenance for executed pushed commands', async () => {
    const executedPushedCommand = {
      id: 'cmd_finalized',
      commandName: 'createProduct',
      payload: '{}',
      contractVersion: '1.0.0',
      commandType: 'frontend',
      systemName: 'shopping',
      aggregateId: 'acct_test',
      aggregateName: 'main',
      sessionId: 'sesn_test',
      userId: 'user_test',
      frontendName: 'dashboard',
      stagedCursor: 'stcur_test',
      stagedAt: '2026-01-01T00:00:00.000Z',
      replicaIndex: 1,
      pushedAt: '2026-01-01T00:00:00.000Z',
      pushedCursor: 'pcur_test',
      mode: 'authoritative',
      aggregateCursor: 'acur_test',
      aggregateIndex: 1,
      executedAt: '2026-01-01T00:00:00.000Z',
      status: 'executed',
    };

    const decoded = await Effect.runPromise(
      Schema.decodeUnknown(ExecutedPushedCommandSchema)(executedPushedCommand),
    );
    await expect(
      Effect.runPromise(
        Schema.decodeUnknown(ExecutedPushedCommandSchema)({
          ...executedPushedCommand,
          pushedCursor: null,
        }),
      ),
    ).rejects.toThrow();

    expect(decoded).toEqual({
      ...executedPushedCommand,
      stagedAt: new Date('2026-01-01T00:00:00.000Z'),
      pushedAt: new Date('2026-01-01T00:00:00.000Z'),
      executedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  it('requires provenance for failed pushed commands', async () => {
    const failedPushedCommand = {
      id: 'cmd_failed',
      commandName: 'createProduct',
      payload: '{}',
      contractVersion: '1.0.0',
      commandType: 'frontend',
      systemName: 'shopping',
      aggregateId: 'acct_test',
      aggregateName: 'main',
      sessionId: 'sesn_test',
      userId: 'user_test',
      frontendName: 'dashboard',
      stagedCursor: 'stcur_test',
      stagedAt: '2026-01-01T00:00:00.000Z',
      replicaIndex: 1,
      pushedAt: '2026-01-01T00:00:00.000Z',
      pushedCursor: 'pcur_test',
      aggregateCursor: 'acur_test',
      aggregateIndex: 1,
      failedAt: '2026-01-01T00:00:00.000Z',
      failure: 'failed',
      status: 'failed',
    };

    const decoded = await Effect.runPromise(
      Schema.decodeUnknown(FailedPushedCommandSchema)(failedPushedCommand),
    );
    await expect(
      Effect.runPromise(
        Schema.decodeUnknown(FailedPushedCommandSchema)({
          ...failedPushedCommand,
          sessionId: null,
        }),
      ),
    ).rejects.toThrow();

    expect(decoded).toEqual({
      ...failedPushedCommand,
      stagedAt: new Date('2026-01-01T00:00:00.000Z'),
      pushedAt: new Date('2026-01-01T00:00:00.000Z'),
      failedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  it('separates page-created session commands from indexed replica commands', async () => {
    const stagedSessionCommand = {
      id: 'cmd_staged',
      commandName: 'createProduct',
      payload: '{}',
      contractVersion: '1.0.0',
      commandType: 'frontend',
      systemName: 'shopping',
      aggregateId: 'acct_test',
      aggregateName: 'main',
      sessionId: 'sesn_test',
      userId: 'user_test',
      frontendName: 'dashboard',
      stagedCursor: 'stcur_test',
      stagedAt: '2026-01-01T00:00:00.000Z',
      pushedCursor: null,
      status: 'staged',
    };

    const decodedSessionCommand = await Effect.runPromise(
      Schema.decodeUnknown(StagedSessionCommandSchema)(stagedSessionCommand),
    );
    const decodedReplicaCommand = await Effect.runPromise(
      Schema.decodeUnknown(StagedReplicaCommandSchema)({
        ...stagedSessionCommand,
        replicaIndex: 1,
      }),
    );
    const decodedMaximumReplicaCommand = await Effect.runPromise(
      Schema.decodeUnknown(StagedReplicaCommandSchema)({
        ...stagedSessionCommand,
        replicaIndex: Number.MAX_SAFE_INTEGER,
      }),
    );

    expect(decodedSessionCommand.stagedAt).toEqual(
      new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(decodedReplicaCommand.replicaIndex).toBe(1);
    expect(decodedMaximumReplicaCommand.replicaIndex).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    await expect(
      Effect.runPromise(
        Schema.decodeUnknown(StagedReplicaCommandSchema)(stagedSessionCommand),
      ),
    ).rejects.toThrow();
    for (const replicaIndex of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        Effect.runPromise(
          Schema.decodeUnknown(StagedReplicaCommandSchema)({
            ...stagedSessionCommand,
            replicaIndex,
          }),
        ),
      ).rejects.toThrow();
    }
  });

  it('round-trips both complete failed staged replica variants', async () => {
    const failedStagedCommand = {
      id: 'cmd_failed_staged',
      commandName: 'createProduct',
      payload: '{}',
      contractVersion: '1.0.0',
      commandType: 'frontend',
      systemName: 'shopping',
      aggregateId: 'acct_test',
      aggregateName: 'main',
      sessionId: 'sesn_test',
      userId: 'user_test',
      frontendName: 'dashboard',
      stagedCursor: 'stcur_test',
      stagedAt: '2026-01-01T00:00:00.000Z',
      pushedCursor: null,
      replicaIndex: 1,
      failedAt: '2026-01-01T00:00:02.000Z',
      failure: 'rejected',
      status: 'failed',
    };
    const finalizedFailedStagedCommand = {
      ...failedStagedCommand,
      aggregateCursor: 'acur_test',
      aggregateIndex: 2,
    };

    const decodedFailed = await Effect.runPromise(
      Schema.decodeUnknown(FailedStagedReplicaCommandSchema)(
        failedStagedCommand,
      ),
    );
    const decodedFinalized = await Effect.runPromise(
      Schema.decodeUnknown(FinalizedFailedStagedReplicaCommandSchema)(
        finalizedFailedStagedCommand,
      ),
    );

    expect(decodedFailed).toEqual({
      ...failedStagedCommand,
      stagedAt: new Date('2026-01-01T00:00:00.000Z'),
      failedAt: new Date('2026-01-01T00:00:02.000Z'),
    });
    expect(decodedFinalized).toEqual({
      ...finalizedFailedStagedCommand,
      stagedAt: new Date('2026-01-01T00:00:00.000Z'),
      failedAt: new Date('2026-01-01T00:00:02.000Z'),
    });
    await expect(
      Effect.runPromise(
        Schema.decodeUnknown(FailedStagedReplicaCommandSchema)(
          finalizedFailedStagedCommand,
        ),
      ),
    ).rejects.toThrow();
  });

  it('decodes every complete PushBlock partition and rejects legacy shapes', async () => {
    const stagedReplicaCommand = {
      id: 'cmd_replica',
      commandName: 'createProduct',
      payload: '{}',
      contractVersion: '1.0.0',
      commandType: 'frontend',
      systemName: 'shopping',
      aggregateId: 'acct_test',
      aggregateName: 'main',
      sessionId: 'sesn_test',
      userId: 'user_test',
      frontendName: 'dashboard',
      stagedCursor: 'stcur_test',
      stagedAt: '2026-01-01T00:00:00.000Z',
      pushedCursor: null,
      replicaIndex: 1,
      status: 'staged',
    };
    const pushedCommand = {
      ...stagedReplicaCommand,
      pushedAt: '2026-01-01T00:00:01.000Z',
      pushedCursor: 'pcur_test',
      status: 'pushed',
    };
    const executedCommand = {
      ...pushedCommand,
      mode: 'authoritative',
      aggregateCursor: 'acur_executed',
      aggregateIndex: 2,
      executedAt: '2026-01-01T00:00:02.000Z',
      status: 'executed',
    };
    const failedStagedCommand = {
      ...stagedReplicaCommand,
      failedAt: '2026-01-01T00:00:02.000Z',
      failure: 'rejected',
      status: 'failed',
    };
    const finalizedFailedStagedCommand = {
      ...failedStagedCommand,
      id: 'cmd_failed_staged_finalized',
      aggregateCursor: 'acur_failed_staged',
      aggregateIndex: 3,
    };
    const failedPushedCommand = {
      ...pushedCommand,
      id: 'cmd_failed_pushed',
      aggregateCursor: 'acur_failed_pushed',
      aggregateIndex: 4,
      failedAt: '2026-01-01T00:00:03.000Z',
      failure: 'failed',
      status: 'failed',
    };
    const pushBlock = {
      writeIndex: 9,
      guardedAtAggregateCursor: 'acur_guard',
      pendingCommands: [pushedCommand],
      pushedCommands: [{ ...pushedCommand, id: 'cmd_newly_pushed' }],
      executedCommands: [executedCommand],
      failedStagedCommands: [failedStagedCommand, finalizedFailedStagedCommand],
      failedPushedCommands: [failedPushedCommand],
    };

    const decoded = await Effect.runPromise(
      Schema.decodeUnknown(PushBlockSchema)(pushBlock),
    );
    const decodedMaximumWriteIndex = await Effect.runPromise(
      Schema.decodeUnknown(PushBlockSchema)({
        ...pushBlock,
        writeIndex: Number.MAX_SAFE_INTEGER,
      }),
    );

    expect(decoded.writeIndex).toBe(9);
    expect(decodedMaximumWriteIndex.writeIndex).toBe(Number.MAX_SAFE_INTEGER);
    expect(decoded.guardedAtAggregateCursor).toBe('acur_guard');
    expect(decoded.pendingCommands).toHaveLength(1);
    expect(decoded.pushedCommands).toHaveLength(1);
    expect(decoded.executedCommands).toHaveLength(1);
    expect(decoded.failedStagedCommands).toHaveLength(2);
    expect(decoded.failedPushedCommands).toHaveLength(1);
    expect(decoded.failedStagedCommands[1]).toEqual(
      expect.objectContaining({
        aggregateCursor: 'acur_failed_staged',
        aggregateIndex: 3,
        replicaIndex: 1,
      }),
    );

    await expect(
      Effect.runPromise(
        Schema.decodeUnknown(PushBlockSchema)({
          id: 'pblk_legacy',
          admissionLastAggregateCursor: null,
          commands: [pushedCommand],
        }),
      ),
    ).rejects.toThrow();
    await expect(
      Effect.runPromise(
        Schema.decodeUnknown(PushBlockSchema)({
          ...pushBlock,
          guardedAtAggregateCursor: undefined,
          admissionLastAggregateCursor: null,
        }),
      ),
    ).rejects.toThrow();
    await expect(
      Effect.runPromise(
        Schema.decodeUnknown(PushBlockSchema)({
          ...pushBlock,
          pendingCommands: [
            {
              ...pushedCommand,
              replicaIndex: undefined,
            },
          ],
        }),
      ),
    ).rejects.toThrow();
    for (const writeIndex of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        Effect.runPromise(
          Schema.decodeUnknown(PushBlockSchema)({
            ...pushBlock,
            writeIndex,
          }),
        ),
      ).rejects.toThrow();
    }
  });
});
