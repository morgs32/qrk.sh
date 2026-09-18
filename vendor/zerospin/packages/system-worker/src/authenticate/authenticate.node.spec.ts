import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type {
  IAggregateAuthentication,
  IServiceAuthentication,
} from '@zerospin/core/authentication/types';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/makeContractVersion';
import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { ZerospinError } from '@zerospin/error';
import { Effect, Fiber, Result, Schema } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticateAggregate } from '../authenticateAggregate/authenticateAggregate.ts';
import { authenticateService } from '../authenticateService/authenticateService.ts';

const { authored, serviceAuthored, begin, complete, execute } = vi.hoisted(
  () => ({
    authored: vi.fn<IAggregateAuthentication['authenticate']>(),
    serviceAuthored: vi.fn<IServiceAuthentication['authenticate']>(),
    begin: vi.fn(),
    complete: vi.fn(),
    execute: vi.fn(),
  }),
);
vi.mock('cloudflare:workers', () => ({
  env: { ZEROSPIN_SYSTEM_ID: 'sys_auth_test' },
}));
vi.mock('../SystemLogRepo/SystemLogRepo.js', () => ({
  SystemLogRepo: {
    getRepo: () =>
      Effect.succeed({
        beginAggregateAuthenticationAttempt: begin,
        beginServiceAuthenticationAttempt: begin,
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
  const { defineAggregate } =
    await import('@zerospin/core/aggregate/defineAggregate');
  const { makeAggregateVersion } =
    await import('@zerospin/core/aggregate/makeAggregateVersion');
  const open = makeAggregateVersion(defineAggregate({ name: 'open' }), {
    version: '1.0.0',
    models: {},
    contracts: {},
    selections: {},
  });
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
                  props: Parameters<
                    IAggregateAuthentication['authenticate']
                  >[0],
                ) => Effect.suspend(() => authored(props)),
              },
            },
          },
          dated: {
            '1.0.0': {
              contracts: {},
              authentication: {
                signatureSchema: Schema.Struct({
                  aggregateId: Schema.String,
                  issuedAt: Schema.DateFromString,
                }),
                authenticationSchema: Schema.Struct({
                  aggregateId: Schema.String,
                  issuedAt: Schema.DateFromString,
                }),
                selectionSchema: Schema.Struct({ aggregateId: Schema.String }),
                pattern: RoutePattern.parse('/:aggregateId'),
                authenticate: (
                  props: Parameters<
                    IAggregateAuthentication['authenticate']
                  >[0],
                ) => Effect.suspend(() => authored(props)),
              },
            },
          },
          open: {
            '1.0.0': open,
          },
        },
        services: {
          app: {
            '1.0.0': {
              authentication: {
                signatureSchema: Schema.Struct({ userId: Schema.String }),
                authenticationSchema: Schema.Struct({ userId: Schema.String }),
                selectionSchema: Schema.Struct({ userId: Schema.String }),
                pattern: RoutePattern.parse('/:userId'),
                authenticate: (
                  props: Parameters<IServiceAuthentication['authenticate']>[0],
                ) => Effect.suspend(() => serviceAuthored(props)),
              },
            },
          },
        },
      },
    },
  };
});

beforeEach(() => {
  authored.mockReset();
  serviceAuthored.mockReset();
  serviceAuthored.mockImplementation(({ signature }) =>
    Effect.succeed(signature),
  );
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

describe('aggregate and service authentication admission and audit', () => {
  it('shares selection partitions while retaining distinct full claims and hashes', async () => {
    const results = [];
    for (const role of ['reader', 'writer']) {
      results.push(
        await Effect.runPromise(
          authenticateAggregate({
            aggregateName: 'user',
            aggregateVersion: '1.0.0',
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
    expect(begin).toHaveBeenCalledWith({
      aggregateName: 'user',
      aggregateVersion: '1.0.0',
    });
    expect(authored).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(begin.mock.invocationCallOrder[0]).toBeLessThan(
      authored.mock.invocationCallOrder[0]!,
    );
  });

  it('validates signatures after beginning and never audits unvalidated data', async () => {
    const result = await Effect.runPromise(
      authenticateAggregate({
        aggregateName: 'user',
        aggregateVersion: '1.0.0',
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
      authenticateAggregate({
        aggregateName: 'user',
        aggregateVersion: '1.0.0',
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
        authenticateAggregate({
          aggregateName: 'user',
          aggregateVersion: '1.0.0',
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
      authenticateAggregate({
        aggregateName: 'user',
        aggregateVersion: '1.0.0',
        signature: { userId: 'user', aggregateId: 'acct_one', role: 'reader' },
      }).pipe(Effect.provide(AsyncLive)),
    );
    await entered.promise;
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(begin).toHaveBeenCalledOnce();
    expect(complete).not.toHaveBeenCalled();
  });

  it('rejects provisioning contracts outside the selected aggregate version', async () => {
    const contract = makeContractVersion(defineContract('unregistered'), {
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
      authenticateAggregate({
        aggregateName: 'user',
        aggregateVersion: '1.0.0',
        signature: { userId: 'user', aggregateId: 'acct_one', role: 'reader' },
      }).pipe(Effect.provide(AsyncLive), Effect.result),
    );
    if (Result.isSuccess(result)) {
      throw new Error('Expected aggregate validation failure');
    }
    expect(result.failure.code).toBe('authentication-command-contract-invalid');
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not expose provisioning during service authentication', async () => {
    const result = await Effect.runPromise(
      authenticateService({
        serviceName: 'app',
        serviceVersion: '1.0.0',
        signature: { userId: 'usr' },
      }).pipe(Effect.provide(AsyncLive)),
    );
    expect(result.authentication).toEqual({ userId: 'usr' });
    expect(serviceAuthored).toHaveBeenCalledWith({
      signature: { userId: 'usr' },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(begin).toHaveBeenCalledWith({
      serviceName: 'app',
      serviceVersion: '1.0.0',
    });
  });

  it('admits aggregates with omitted authentication with caller-selected aggregateId', async () => {
    const result = await Effect.runPromise(
      authenticateAggregate({
        aggregateName: 'open',
        aggregateVersion: '1.0.0',
        signature: { aggregateId: 'acct_open' },
      }).pipe(Effect.provide(AsyncLive)),
    );
    expect(result.authentication).toEqual({ aggregateId: 'acct_open' });
    expect(result.selection).toEqual({ aggregateId: 'acct_open' });
    expect(result.selectionPath).toBe('/acct_open');
    expect(authored).not.toHaveBeenCalled();
    expect(begin).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
  });
});

it('validates decoded signatures and encodes transformed claims for audit and hashing', async () => {
  const issuedAt = new Date('2026-09-18T12:00:00.000Z');
  const result = await Effect.runPromise(
    authenticateAggregate({
      aggregateName: 'dated',
      aggregateVersion: '1.0.0',
      signature: { aggregateId: 'acct_dates', issuedAt },
    }).pipe(Effect.provide(AsyncLive)),
  );
  expect(authored.mock.calls[0]?.[0].signature).toEqual({
    aggregateId: 'acct_dates',
    issuedAt,
  });
  expect(result.authentication).toEqual({
    aggregateId: 'acct_dates',
    issuedAt: issuedAt.toISOString(),
  });
  expect(JSON.stringify(complete.mock.calls)).toContain(issuedAt.toISOString());
  const invalid = await Effect.runPromise(
    authenticateAggregate({
      aggregateName: 'dated',
      aggregateVersion: '1.0.0',
      signature: {
        aggregateId: 'acct_dates',
        issuedAt: issuedAt.toISOString(),
      },
    }).pipe(Effect.provide(AsyncLive), Effect.result),
  );
  expect(invalid).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'authentication-signature-invalid' },
  });
  expect(authored).toHaveBeenCalledOnce();
});
