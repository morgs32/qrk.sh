import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { sessionRepoDbConfig } from './sessionRepoDbConfig.ts';

it('round trips required phase JSON and dates without wrapping structured failures', async () => {
  const table = sessionRepoDbConfig.tables.commands;
  const startedAt = new Date('2026-09-25T12:00:00Z');
  const completedAt = new Date('2026-09-25T12:00:01Z');
  const row = {
    id: 'cmd_one' as const,
    commandName: 'create',
    payload: '{}',
    contractVersion: '1.0.0',
    aggregateId: 'acct_one',
    aggregateName: 'test',
    actorName: 'writer',
    actorVersion: '1.0.0',
    sessionName: 'editor',
    claims: {},
    sessionId: 'sesn_one' as const,
    sessionIndex: 1,
    pushIndex: null,
    staging: {
      startedAt,
      completedAt,
      stagedDelta: { inserted: [], updated: [], deleted: [], mutations: [] },
    },
    admission: {
      status: 'failed' as const,
      startedAt,
      completedAt,
      failure: {
        _tag: 'ZerospinError' as const,
        code: 'unknown-to-this-client',
        message: 'Denied',
        status: 403,
        extra: { nested: ['value'] },
      },
    },
    execution: {
      status: 'skipped' as const,
      reason: 'admission-failed' as const,
    },
    actorDelta: null,
    aggregateIndex: null,
    executedIndex: null,
    executedHash: null,
  };
  const encoded = await Effect.runPromise(table.encodeRow(row));
  expect(JSON.parse(encoded.admission)).toEqual({
    ...row.admission,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
  });
  expect(await Effect.runPromise(table.decodeRow(encoded))).toEqual(row);
  expect(
    await Effect.runPromise(
      table.decodeRow({ ...encoded, staging: undefined }).pipe(Effect.result),
    ),
  ).toMatchObject({ _tag: 'Failure' });
  expect(
    await Effect.runPromise(
      table
        .decodeRow({ ...encoded, staging: '{"startedAt":"invalid"}' })
        .pipe(Effect.result),
    ),
  ).toMatchObject({ _tag: 'Failure' });
});
