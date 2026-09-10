import { Effect, Result } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  makeAggregateFrontendBackupKey,
  type IAggregateFrontendBackupIdentity,
} from './makeAggregateFrontendBackupKey.ts';
import {
  makeServiceFrontendBackupKey,
  type IServiceFrontendBackupIdentity,
} from './makeServiceFrontendBackupKey.ts';

const aggregate = {
  systemId: 'sys_one',
  userId: 'user_one',
  aggregateId: 'acct_one',
  aggregateName: 'account',
  aggregateVersion: '1.0.0',
  frontendName: 'web',
  aggregateFrontendLockKey: 'a'.repeat(64),
} satisfies IAggregateFrontendBackupIdentity;
const service = {
  systemId: 'sys_one',
  userId: 'user_one',
  serviceName: 'catalog',
  serviceVersion: '1.0.0',
  frontendName: 'web',
  serviceFrontendLockKey: 'b'.repeat(64),
} satisfies IServiceFrontendBackupIdentity;

describe('exact frontend backup routes', () => {
  it('retains readable identities and the complete canonical lock digest', () => {
    expect(Effect.runSync(makeAggregateFrontendBackupKey(aggregate))).toBe(
      `/zerospin/sys_one/user_one/aggregate/account/1.0.0/acct_one/web/${'a'.repeat(64)}/backup.sqlite3`,
    );
    expect(Effect.runSync(makeServiceFrontendBackupKey(service))).toBe(
      `/zerospin/sys_one/user_one/service/catalog/1.0.0/web/${'b'.repeat(64)}/backup.sqlite3`,
    );
  });

  it('isolates every aggregate tuple field', () => {
    const identities: IAggregateFrontendBackupIdentity[] = [
      aggregate,
      { ...aggregate, systemId: 'sys_two' },
      { ...aggregate, userId: 'user_two' },
      { ...aggregate, aggregateId: 'acct_two' },
      { ...aggregate, aggregateName: 'account-two' },
      { ...aggregate, aggregateVersion: '2.0.0' },
      { ...aggregate, frontendName: 'mobile' },
      { ...aggregate, aggregateFrontendLockKey: 'a'.repeat(63) + 'b' },
    ];
    expect(
      new Set(
        identities.map(identity =>
          Effect.runSync(makeAggregateFrontendBackupKey(identity)),
        ),
      ).size,
    ).toBe(identities.length);
  });

  it('isolates every service tuple field', () => {
    const identities: IServiceFrontendBackupIdentity[] = [
      service,
      { ...service, systemId: 'sys_two' },
      { ...service, userId: 'user_two' },
      { ...service, serviceName: 'inventory' },
      { ...service, serviceVersion: '2.0.0' },
      { ...service, frontendName: 'mobile' },
      { ...service, serviceFrontendLockKey: 'b'.repeat(63) + 'c' },
    ];
    expect(
      new Set(
        identities.map(identity =>
          Effect.runSync(makeServiceFrontendBackupKey(identity)),
        ),
      ).size,
    ).toBe(identities.length);
  });

  it('encodes delimiters, percent signs, Unicode, and embedded dot segments without VFS normalization collisions', () => {
    const values = [
      'a/b',
      'a%2Fb',
      'a\\b',
      'a%5Cb',
      'a?b#c',
      'é',
      'e\u0301',
      '%C3%A9',
      'a b',
      'a%20b',
      '../../x',
      '%2e%2e',
    ];
    const keys = values.map(userId =>
      Effect.runSync(makeAggregateFrontendBackupKey({ ...aggregate, userId })),
    );
    expect(new Set(keys).size).toBe(values.length);
    for (const [index, key] of keys.entries()) {
      expect(new URL(key, 'file:///').pathname).toBe(key);
      expect(decodeURIComponent(key.split('/')[3]!)).toBe(values[index]);
    }
    const serviceKeys = values.map(userId =>
      Effect.runSync(makeServiceFrontendBackupKey({ ...service, userId })),
    );
    expect(new Set(serviceKeys).size).toBe(values.length);
    for (const [index, key] of serviceKeys.entries()) {
      expect(new URL(key, 'file:///').pathname).toBe(key);
      expect(decodeURIComponent(key.split('/')[3]!)).toBe(values[index]);
    }
  });

  it.each(['', '.', '..', '\n', 'a\tb', '\u0000', '\u007f', '\ud800'])(
    'rejects the invalid identity segment %j before URL normalization',
    userId => {
      expect(
        Result.isFailure(
          Effect.runSync(
            makeAggregateFrontendBackupKey({ ...aggregate, userId }).pipe(
              Effect.result,
            ),
          ),
        ),
      ).toBe(true);
      expect(
        Result.isFailure(
          Effect.runSync(
            makeServiceFrontendBackupKey({ ...service, userId }).pipe(
              Effect.result,
            ),
          ),
        ),
      ).toBe(true);
    },
  );

  it.each(['short', 'a'.repeat(63), 'a'.repeat(65), 'G'.repeat(64)])(
    'rejects incomplete or noncanonical lock digests %j',
    key => {
      expect(
        Result.isFailure(
          Effect.runSync(
            makeAggregateFrontendBackupKey({
              ...aggregate,
              aggregateFrontendLockKey: key,
            }).pipe(Effect.result),
          ),
        ),
      ).toBe(true);
      expect(
        Result.isFailure(
          Effect.runSync(
            makeServiceFrontendBackupKey({
              ...service,
              serviceFrontendLockKey: key,
            }).pipe(Effect.result),
          ),
        ),
      ).toBe(true);
    },
  );

  it('does not select a different backup for a build or execution session', () => {
    const firstAggregate = {
      ...aggregate,
      sessionId: 'sesn_first',
      buildId: 'build-first',
    };
    const secondAggregate = {
      ...aggregate,
      sessionId: 'sesn_second',
      buildId: 'build-second',
    };
    expect(Effect.runSync(makeAggregateFrontendBackupKey(firstAggregate))).toBe(
      Effect.runSync(makeAggregateFrontendBackupKey(secondAggregate)),
    );
    const firstService = {
      ...service,
      sessionId: 'sesn_first',
      buildId: 'build-first',
    };
    const secondService = {
      ...service,
      sessionId: 'sesn_second',
      buildId: 'build-second',
    };
    expect(Effect.runSync(makeServiceFrontendBackupKey(firstService))).toBe(
      Effect.runSync(makeServiceFrontendBackupKey(secondService)),
    );
  });
});
