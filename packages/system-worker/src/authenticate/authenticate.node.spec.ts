import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type { IAuthentication } from '@zerospin/core/authentication/types';
import { defineCommand } from '@zerospin/core/contracts/Command';
import { makeContractVersion } from '@zerospin/core/contracts/makeVersion';
import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { ZerospinError } from '@zerospin/error';
import { Effect, Fiber, Result, Schema } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticate } from './authenticate.ts';

const { authored, begin, complete, execute } = vi.hoisted(() => ({
  authored: vi.fn<IAuthentication['authenticate']>(),
  begin: vi.fn(),
  complete: vi.fn(),
  execute: vi.fn(),
}));
vi.mock('cloudflare:workers', () => ({
  env: { ZEROSPIN_SYSTEM_ID: 'sys_auth_test' },
}));
vi.mock('../SystemLogRepo/SystemLogRepo.js', () => ({
  SystemLogRepo: {
    getRepo: () =>
      Effect.succeed({
        beginAuthenticationAttempt: begin,
        completeAuthenticationAttempt: complete,
      }),
  },
}));
vi.mock('../AggregateChain/AggregateChain.js', () => ({
  AggregateChain: {
    getRepo: () => Effect.succeed({ executeAggregateCommand: execute }),
  },
}));
vi.mock('config', async () => {
  const { RoutePattern } = await import('@remix-run/route-pattern');
  const { Schema, Effect } = await import('effect');
  return {
    default: {
      system: {
        name: 'auth-test',
        aggregates: {
          user: {
            '1.0.0': {
              contracts: {},
              authentication: {
                signatureSchema: Schema.Struct({
                  userId: Schema.String,
                  aggregateId: Schema.String,
                  role: Schema.String,
                }),
                authenticationSchema: Schema.Struct({
                  userId: Schema.String,
                  aggregateId: Schema.String,
                  role: Schema.String,
                }),
                selectionSchema: Schema.Struct({ userId: Schema.String }),
                pattern: RoutePattern.parse('/:userId'),
                authenticate: (
                  props: Parameters<IAuthentication['authenticate']>[0],
                ) => Effect.suspend(() => authored(props)),
              },
            },
          },
        },
        services: {},
      },
    },
  };
});

beforeEach(() => {
  authored.mockReset();
  begin.mockReset();
  complete.mockReset();
  execute.mockReset();
  authored.mockImplementation(({ signature }) =>
    Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Unknown))(
      signature,
    ).pipe(Effect.orDie),
  );
  begin.mockResolvedValue(encodeSuccess({ attemptId: 'aat_test' }));
  complete.mockResolvedValue(encodeSuccess(undefined));
});

describe('owner authentication admission and audit', () => {
  it('shares selection partitions while retaining distinct full claims and hashes', async () => {
    const results = [];
    for (const role of ['reader', 'writer']) {
      results.push(
        await Effect.runPromise(
          authenticate({
            ownerKind: 'aggregate',
            ownerName: 'user',
            ownerVersion: '1.0.0',
            signature: { userId: 'same/user', aggregateId: 'acct_one', role },
          }).pipe(Effect.provide(AsyncLive)),
        ),
      );
    }
    expect(results[0]?.selectionPath).toBe(results[1]?.selectionPath);
    expect(results[0]?.selection).toEqual({ userId: 'same/user' });
    expect(results[0]?.authenticationHash).not.toBe(
      results[1]?.authenticationHash,
    );
    expect(authored).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(begin.mock.invocationCallOrder[0]).toBeLessThan(
      authored.mock.invocationCallOrder[0]!,
    );
  });

  it('validates signatures after beginning and never audits unvalidated data', async () => {
    const result = await Effect.runPromise(
      authenticate({
        ownerKind: 'aggregate',
        ownerName: 'user',
        ownerVersion: '1.0.0',
        signature: { secret: 'do-not-retain' },
      }).pipe(Effect.provide(AsyncLive), Effect.result),
    );
    expect(Result.isFailure(result)).toBe(true);
    expect(authored).not.toHaveBeenCalled();
    expect(begin).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith({
      attemptId: 'aat_test',
      result: {
        status: 'failed',
        failure: {
          code: 'authentication-failed',
          message: 'Authentication did not succeed',
        },
      },
    });
    expect(JSON.stringify(complete.mock.calls)).not.toContain('do-not-retain');
  });

  it('rejects unsupported authentication output and sanitizes the audit', async () => {
    authored.mockReturnValue(Effect.succeed({ secret: 'invalid-claims' }));
    const result = await Effect.runPromise(
      authenticate({
        ownerKind: 'aggregate',
        ownerName: 'user',
        ownerVersion: '1.0.0',
        signature: { userId: 'user', aggregateId: 'acct_one', role: 'reader' },
      }).pipe(Effect.provide(AsyncLive), Effect.result),
    );
    if (Result.isSuccess(result)) {
      throw new Error('Expected validation failure');
    }
    expect(result.failure.code).toBe('authentication-result-invalid');
    expect(JSON.stringify(complete.mock.calls)).not.toContain('invalid-claims');
  });

  it.each(['begin', 'complete'])(
    'withholds success when %s persistence fails',
    async stage => {
      (stage === 'begin' ? begin : complete).mockResolvedValue(
        encodeFailure(new ZerospinError({ code: 'audit-write-failed' })),
      );
      const result = await Effect.runPromise(
        authenticate({
          ownerKind: 'aggregate',
          ownerName: 'user',
          ownerVersion: '1.0.0',
          signature: {
            userId: 'user',
            aggregateId: 'acct_one',
            role: 'reader',
          },
        }).pipe(Effect.provide(AsyncLive), Effect.result),
      );
      if (Result.isSuccess(result)) {
        throw new Error('Expected persistence failure');
      }
      expect(result.failure.code).toBe('audit-write-failed');
      if (stage === 'begin') expect(authored).not.toHaveBeenCalled();
    },
  );

  it('leaves interrupted authentication unfinished', async () => {
    const entered = Promise.withResolvers<void>();
    authored.mockImplementation(() =>
      Effect.gen(function* () {
        entered.resolve();
        yield* Effect.never;
        return {};
      }),
    );
    const fiber = Effect.runFork(
      authenticate({
        ownerKind: 'aggregate',
        ownerName: 'user',
        ownerVersion: '1.0.0',
        signature: { userId: 'user', aggregateId: 'acct_one', role: 'reader' },
      }).pipe(Effect.provide(AsyncLive)),
    );
    await entered.promise;
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(begin).toHaveBeenCalledOnce();
    expect(complete).not.toHaveBeenCalled();
  });

  it('rejects provisioning contracts outside the selected owner', async () => {
    const contract = makeContractVersion(defineCommand('unregistered'), {
      version: '1.0.0',
      payload: {},
    });
    authored.mockImplementation(({ executeCommand }) =>
      Effect.gen(function* () {
        yield* executeCommand({
          aggregateId: 'acct_one',
          contract,
          payload: {},
        });
        return {};
      }),
    );
    const result = await Effect.runPromise(
      authenticate({
        ownerKind: 'aggregate',
        ownerName: 'user',
        ownerVersion: '1.0.0',
        signature: { userId: 'user', aggregateId: 'acct_one', role: 'reader' },
      }).pipe(Effect.provide(AsyncLive), Effect.result),
    );
    if (Result.isSuccess(result)) {
      throw new Error('Expected owner validation failure');
    }
    expect(result.failure.code).toBe('authentication-command-contract-invalid');
    expect(execute).not.toHaveBeenCalled();
  });
});
