import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  abortAllDurableObjects,
  env,
  runInDurableObject,
} from 'cloudflare:test';
import { Effect, Result } from 'effect';
import { describe, expect, it } from 'vitest';

import { AuthenticatedVersionedAggregateRepo } from '../AuthenticatedVersionedAggregateRepo/AuthenticatedVersionedAggregateRepo.js';
import { SystemLogRepo } from '../SystemLogRepo/SystemLogRepo.js';

import { authenticate } from './authenticate.ts';

describe('owner authentication in Workers', () => {
  it.each(['usr_authentication', 'snow/雪?%#\\', 'a b'])(
    'authenticates and durably audits %s',
    async userId => {
      const result = await Effect.runPromise(
        authenticate({
          ownerKind: 'aggregate',
          ownerName: 'notes',
          ownerVersion: '1.0.0',
          signature: { userId, aggregateId: 'acct_authentication' },
        }).pipe(Effect.provide(AsyncLive)),
      );
      expect(result.authentication).toEqual({
        aggregateId: 'acct_authentication',
        userId,
      });
      expect(result.selection).toEqual({ userId });
      expect(result.authenticationHash).toMatch(/^[a-f0-9]{64}$/);
      const rows = await Effect.runPromise(
        Effect.gen(function* () {
          const log = yield* SystemLogRepo.getRepo({
            key: { systemId: env.ZEROSPIN_SYSTEM_ID },
          });
          return yield* Effect.promise(() =>
            log.getRepoTableRows({
              tableName: 'authenticationAttempts',
              limit: 100,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
        }),
      );
      expect(JSON.stringify(rows)).toContain(result.authenticationHash);
      expect(JSON.stringify(rows)).toContain('succeeded');
    },
  );

  it.each([
    {
      signature: { userId: 12, aggregateId: 'acct_test' },
      code: 'authentication-signature-invalid',
    },
    {
      signature: { userId: 'usr_test', aggregateId: 'invalid' },
      code: 'authentication-aggregate-id-invalid',
    },
    {
      signature: { userId: '', aggregateId: 'acct_test' },
      code: 'authentication-selection-invalid',
    },
  ])(
    'rejects $code and records sanitized failures',
    async ({ signature, code }) => {
      const result = await Effect.runPromise(
        authenticate({
          ownerKind: 'aggregate',
          ownerName: 'notes',
          ownerVersion: '1.0.0',
          signature,
        }).pipe(Effect.provide(AsyncLive), Effect.result),
      );
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) expect(result.failure.code).toBe(code);
      const log = await Effect.runPromise(
        SystemLogRepo.getRepo({ key: { systemId: env.ZEROSPIN_SYSTEM_ID } }),
      );
      const row = await runInDurableObject(log, (_instance, state) =>
        state.storage.sql
          .exec(
            'SELECT status, authentication, failure FROM authenticationAttempts ORDER BY rowid DESC LIMIT 1',
          )
          .one(),
      );
      expect(row).toEqual({
        status: 'failed',
        authentication: null,
        failure: JSON.stringify({
          code: 'authentication-failed',
          message: 'Authentication did not succeed',
        }),
      });
    },
  );

  it('keeps service authentication independent of aggregate IDs', async () => {
    const result = await Effect.runPromise(
      authenticate({
        ownerKind: 'service',
        ownerName: 'app',
        ownerVersion: '1.0.0',
        signature: { userId: 'usr_service' },
      }).pipe(Effect.provide(AsyncLive)),
    );
    expect(result.authentication).toEqual({ userId: 'usr_service' });
    expect(result.selectionPath).toBe('/usr_service');
  });
});

it.each(['begin', 'complete'])(
  'withholds admission when the durable %s write fails',
  async phase => {
    const log = await Effect.runPromise(
      SystemLogRepo.getRepo({ key: { systemId: env.ZEROSPIN_SYSTEM_ID } }),
    );
    await log.ready();
    const before = await runInDurableObject(log, (_instance, state) => {
      const count = state.storage.sql
        .exec<{ count: number }>(
          'SELECT COUNT(*) AS count FROM authenticationAttempts',
        )
        .one().count;
      state.storage.sql.exec(
        `CREATE TRIGGER fail_authentication_write BEFORE ${phase === 'begin' ? 'INSERT' : 'UPDATE'} ON authenticationAttempts BEGIN SELECT RAISE(ABORT, 'simulated audit storage failure'); END`,
      );
      return count;
    });
    try {
      const result = await Effect.runPromise(
        authenticate({
          ownerKind: 'aggregate',
          ownerName: 'notes',
          ownerVersion: '1.0.0',
          signature: { userId: 'audit-fault', aggregateId: 'acct_fault' },
        }).pipe(Effect.provide(AsyncLive), Effect.result),
      );
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure.code).toBe('authentication-attempt-write-failed');
      }
      const rows = await runInDurableObject(log, (_instance, state) =>
        state.storage.sql
          .exec(
            'SELECT status, authentication, failure FROM authenticationAttempts ORDER BY rowid',
          )
          .toArray(),
      );
      expect(rows).toHaveLength(before + (phase === 'complete' ? 1 : 0));
      if (phase === 'complete') {
        expect(rows.at(-1)).toEqual({
          status: 'unfinished',
          authentication: null,
          failure: null,
        });
      }
    } finally {
      await runInDurableObject(log, (_instance, state) => {
        state.storage.sql.exec('DROP TRIGGER fail_authentication_write');
      });
    }
  },
);

it('retains an unfinished attempt across cold activation without claims or signatures', async () => {
  const log = await Effect.runPromise(
    SystemLogRepo.getRepo({ key: { systemId: env.ZEROSPIN_SYSTEM_ID } }),
  );
  const { attemptId } = await Effect.runPromise(
    Effect.promise(() =>
      log.beginAuthenticationAttempt({
        ownerKind: 'aggregate',
        ownerName: 'notes',
        ownerVersion: '1.0.0',
      }),
    ).pipe(Effect.flatMap(decodeRpc)),
  );
  await abortAllDurableObjects();
  const resumed = await Effect.runPromise(
    SystemLogRepo.getRepo({ key: { systemId: env.ZEROSPIN_SYSTEM_ID } }),
  );
  const row = await runInDurableObject(resumed, (_instance, state) =>
    state.storage.sql
      .exec(
        'SELECT status, authentication, failure, completedAt FROM authenticationAttempts WHERE attemptId = ?',
        attemptId,
      )
      .one(),
  );
  expect(row).toEqual({
    status: 'unfinished',
    authentication: null,
    failure: null,
    completedAt: null,
  });
});

it.each(['missing-leading-slash', '/usr%2fnoncanonical', '//usr', '/%ZZ', '/'])(
  'rejects cold replica path %s before selection execution',
  async selectionPath => {
    const replica = await Effect.runPromise(
      AuthenticatedVersionedAggregateRepo.getRepo({
        key: {
          systemId: env.ZEROSPIN_SYSTEM_ID,
          aggregateName: 'notes',
          aggregateVersion: '1.0.0',
          aggregateId: 'acct_cold_invalid',
          selectionPath,
        },
      }),
    );
    await expect(Promise.resolve(replica.ready)).rejects.toThrow(
      /selection-path/,
    );
  },
);
