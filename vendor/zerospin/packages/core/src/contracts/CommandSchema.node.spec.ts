import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { DeployConfigSchema } from '../system/ZerospinConfigSchema.ts';

import {
  DeploySeedCommandSchema,
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
  FailedStagedCommandSchema,
  PushedBlockSchema,
  StagedCommandSchema,
} from './CommandSchema.ts';

describe('CommandSchema', () => {
  it('decodes service commands in deploy seed schema', async () => {
    const serviceCommand = {
      id: 'cmd_service',
      commandName: 'createProduct',
      payload: {
        id: 'prd_seed',
      },
      version: '1.0.0',
      commandType: 'service',
      serviceName: 'app',
      systemVersion: '1.0.0',
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

  it('requires provenance for executed pushed commands', async () => {
    const executedPushedCommand = {
      id: 'cmd_finalized',
      commandName: 'createProduct',
      payload: '{}',
      version: '1.0.0',
      commandType: 'frontend',
      systemName: 'shopping',
      systemVersion: '1.0.0',
      accountId: 'acct_test',
      accountName: 'main',
      sessionId: 'sesn_test',
      actorId: 'actr_test',
      actorName: 'admin',
      frontendName: 'dashboard',
      stagedCursor: 'stcur_test',
      stagedAt: '2026-01-01T00:00:00.000Z',
      pushedAt: '2026-01-01T00:00:00.000Z',
      pushedCursor: 'pcur_test',
      mode: 'authoritative',
      accountCursor: 'acur_test',
      accountIndex: 1,
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
      version: '1.0.0',
      commandType: 'frontend',
      systemName: 'shopping',
      systemVersion: '1.0.0',
      accountId: 'acct_test',
      accountName: 'main',
      sessionId: 'sesn_test',
      actorId: 'actr_test',
      actorName: 'admin',
      frontendName: 'dashboard',
      stagedCursor: 'stcur_test',
      stagedAt: '2026-01-01T00:00:00.000Z',
      pushedAt: '2026-01-01T00:00:00.000Z',
      pushedCursor: 'pcur_test',
      accountCursor: 'acur_test',
      accountIndex: 1,
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

  it('preserves staged provenance in failed commands and pushed blocks', async () => {
    const stagedCommand = {
      id: 'cmd_staged',
      commandName: 'createProduct',
      payload: '{}',
      version: '1.0.0',
      commandType: 'frontend',
      systemName: 'shopping',
      systemVersion: '1.0.0',
      accountId: 'acct_test',
      accountName: 'main',
      sessionId: 'sesn_test',
      actorId: 'actr_test',
      actorName: 'admin',
      frontendName: 'dashboard',
      stagedCursor: 'stcur_test',
      stagedAt: '2026-01-01T00:00:00.000Z',
      pushedCursor: null,
      status: 'staged',
    };
    const pushedCommand = {
      ...stagedCommand,
      pushedAt: '2026-01-01T00:00:01.000Z',
      pushedCursor: 'pcur_test',
      status: 'pushed',
    };

    const decodedStaged = await Effect.runPromise(
      Schema.decodeUnknown(StagedCommandSchema)(stagedCommand),
    );
    const decodedFailed = await Effect.runPromise(
      Schema.decodeUnknown(FailedStagedCommandSchema)({
        ...stagedCommand,
        failedAt: '2026-01-01T00:00:02.000Z',
        failure: 'rejected',
        status: 'failed',
      }),
    );
    const decodedBlock = await Effect.runPromise(
      Schema.decodeUnknown(PushedBlockSchema)({
        id: 'pblk_test',
        sessionId: stagedCommand.sessionId,
        admissionLastAccountCursor: null,
        commands: [pushedCommand],
      }),
    );

    expect(decodedStaged.stagedAt).toEqual(
      new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(decodedFailed).toEqual(
      expect.objectContaining({
        commandType: 'frontend',
        stagedCursor: 'stcur_test',
        stagedAt: new Date('2026-01-01T00:00:00.000Z'),
        failedAt: new Date('2026-01-01T00:00:02.000Z'),
      }),
    );
    expect(decodedBlock.commands[0]).toEqual(
      expect.objectContaining({
        commandType: 'frontend',
        stagedCursor: 'stcur_test',
        stagedAt: new Date('2026-01-01T00:00:00.000Z'),
        pushedAt: new Date('2026-01-01T00:00:01.000Z'),
      }),
    );
    expect(decodedBlock.admissionLastAccountCursor).toBeNull();
  });

  it('requires a nullable account cursor on pushed blocks', async () => {
    const pushedBlock = {
      id: 'pblk_watermark',
      sessionId: 'sesn_watermark',
      admissionLastAccountCursor: 'acur_watermark',
      commands: [],
    };

    const decoded = await Effect.runPromise(
      Schema.decodeUnknown(PushedBlockSchema)(pushedBlock),
    );
    await expect(
      Effect.runPromise(
        Schema.decodeUnknown(PushedBlockSchema)({
          id: pushedBlock.id,
          sessionId: pushedBlock.sessionId,
          commands: pushedBlock.commands,
        }),
      ),
    ).rejects.toThrow();
    await expect(
      Effect.runPromise(
        Schema.decodeUnknown(PushedBlockSchema)({
          ...pushedBlock,
          admissionLastAccountCursor: 'pcur_wrong-prefix',
        }),
      ),
    ).rejects.toThrow();

    expect(decoded.admissionLastAccountCursor).toBe(
      pushedBlock.admissionLastAccountCursor,
    );
  });
});
