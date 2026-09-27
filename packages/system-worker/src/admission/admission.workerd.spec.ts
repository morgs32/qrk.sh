import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { env } from 'cloudflare:test';
import config from 'config';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { admitAggregate } from '../AggregateApi/admit/admitAggregate/admitAggregate.js';
import { admitService } from '../ServiceApi/admit/admitService/admitService.js';
import { SystemLogRepo } from '../SystemLogRepo/SystemLogRepo.js';

const inspect = (
  repo: Pick<SystemLogRepo, 'getRepoTableRows'>,
  props: Parameters<SystemLogRepo['getRepoTableRows']>[0],
): ReturnType<SystemLogRepo['getRepoTableRows']> =>
  repo.getRepoTableRows(props);

const aggregate = (actorName: string, request: IAdmissionRequest) =>
  admitAggregate({
    aggregateName: 'admission',
    aggregateVersion: '1.0.0',
    actorName,
    actorVersion: '1.0.0',
    request,
  });
const service = (actorName: string, request: IAdmissionRequest) =>
  admitService({
    serviceName: 'admission',
    serviceVersion: '1.0.0',
    actorName,
    actorVersion: '1.0.0',
    request,
  });

describe('server identity admission', () => {
  it('accepts direct claims for both actor kinds and derives the actor path', async () => {
    expect(
      await config.system.runtime.runPromise(
        aggregate('direct', {
          claims: { aggregateId: 'acct_direct', subject: 'browser' },
        }),
      ),
    ).toMatchObject({
      claims: { aggregateId: 'acct_direct', subject: 'browser' },
      actorPath: '/browser',
    });
    expect(
      await config.system.runtime.runPromise(
        service('direct', { claims: { subject: 'browser' } }),
      ),
    ).toMatchObject({
      claims: { subject: 'browser' },
      actorPath: '/browser',
    });
  });
  it('returns only server claims when verifying credentials', async () => {
    expect(
      await config.system.runtime.runPromise(
        aggregate('verified', { credentials: { token: 'secret' } }),
      ),
    ).toMatchObject({
      claims: { aggregateId: 'acct_server', subject: 'server' },
      actorPath: '/server',
    });
    const result = await config.system.runtime.runPromise(
      service('verified', { credentials: { token: 'secret' } }),
    );
    expect(result.claims).toEqual({ subject: 'server' });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('rejects missing claims and invalid aggregate IDs from either source', async () => {
    for (const effect of [
      aggregate('direct', { claims: { subject: 'browser' } }),
      aggregate('direct', {
        claims: { aggregateId: 'wrong', subject: 'browser' },
      }),
      aggregate('verified', { credentials: { token: 'bad-id' } }),
      service('direct', { claims: {} }),
    ]) {
      expect(
        (await config.system.runtime.runPromise(effect.pipe(Effect.result)))
          ._tag,
      ).toBe('Failure');
    }
  });
  it('rejects mode mismatches, failed verification and malformed credentials', async () => {
    for (const admit of [aggregate, service]) {
      for (const [actorName, request] of [
        [
          'verified',
          { claims: { subject: 'browser', aggregateId: 'acct_browser' } },
        ],
        ['direct', { credentials: { token: 'secret' } }],
        ['verified', { credentials: { token: 'deny' } }],
        ['verified', { credentials: { token: 42 } }],
      ] satisfies [string, IAdmissionRequest][]) {
        expect(
          (
            await config.system.runtime.runPromise(
              admit(actorName, request).pipe(Effect.result),
            )
          )._tag,
        ).toBe('Failure');
      }
      // Exercise runtime validation across the RPC trust boundary.
      // @ts-expect-error Mixed requests must also be rejected at runtime.
      const invalid = admit('direct', {
        claims: { subject: 'browser', aggregateId: 'acct_browser' },
        credentials: { token: 'secret' },
      });
      expect(
        (await config.system.runtime.runPromise(invalid.pipe(Effect.result)))
          ._tag,
      ).toBe('Failure');
    }
  });
});

it('retains success and failure admission audits without credentials', async () => {
  await config.system.runtime.runPromise(
    aggregate('verified', { credentials: { token: 'secret-audit-token' } }),
  );
  await config.system.runtime.runPromise(
    aggregate('verified', { credentials: { token: 'deny' } }).pipe(
      Effect.result,
    ),
  );
  const name = await config.system.runtime.runPromise(
    SystemLogRepo.fixedDORepoConfig.nameUtils.makeName({
      systemId: env.ZEROSPIN_SYSTEM_ID,
    }),
  );
  const log = env.SYSTEM_LOG_REPO.getByName(name);
  const rows = await Effect.runPromise(
    readRpcEnvelope(await inspect(log, { tableName: 'admissionAttempts' })),
  );
  expect(rows.rows.some(row => row.status === 'succeeded')).toBe(true);
  expect(rows.rows.some(row => row.status === 'failed')).toBe(true);
  expect(JSON.stringify(rows.rows)).not.toContain('secret-audit-token');
  expect(
    rows.rows
      .filter(row => row.status === 'succeeded')
      .some(
        row =>
          typeof row.claims === 'string' && row.claims.includes('acct_server'),
      ),
  ).toBe(true);
});
