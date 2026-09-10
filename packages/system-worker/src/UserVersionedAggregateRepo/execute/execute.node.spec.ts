import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { AggregateExecutionEntrySchema } from '@zerospin/core/contracts/CommandSchema';
import { encodeMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeModelMutations } from '@zerospin/core/contracts/makeModelMutations';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { Effect, Schema } from 'effect';
import { system } from 'system';
import { expect, it } from 'vitest';

import {
  userVersionedAggregateRepoDbConfig,
  userVersionedAggregateRepoTables,
} from '../userVersionedAggregateRepoDbConfig.js';

import { execute } from './execute.js';

it('produces identical per-command deltas across pages, including relationship-driven entries and exits', async () => {
  const models = system.aggregates.user['1.0.0']!.models;
  const key = {
    systemId: 'sys_test',
    aggregateId: 'acct_test',
    aggregateName: 'user',
    aggregateVersion: '1.0.0',
    userId: 'usr_a',
  };
  const time = new Date('2026-09-06T12:00:00Z');
  const mutations = await Effect.runPromise(
    Effect.all([
      makeModelMutations(models.user).create({
        resourceId: 'usr_a',
        attributes: { name: 'A' },
      }),
      makeModelMutations(models.user).create({
        resourceId: 'usr_b',
        attributes: { name: 'B' },
      }),
      makeModelMutations(models.list).create({
        resourceId: 'lst_test',
        attributes: { name: 'List', userId: 'usr_a' },
      }),
      makeModelMutations(models.item).create({
        resourceId: 'tsk_test',
        attributes: { name: 'Item', listId: 'lst_test' },
      }),
      makeModelMutations(models.list).update({
        resourceId: 'lst_test',
        attributes: { userId: 'usr_b' },
      }),
      makeModelMutations(models.list).update({
        resourceId: 'lst_test',
        attributes: { userId: 'usr_a' },
      }),
    ]),
  );
  const rows = await Effect.runPromise(
    Effect.forEach(mutations, (mutation, i) =>
      Effect.gen(function* () {
        const encoded = yield* encodeMutation({
          commandId: `cmd_${i}`,
          mutationIndex: 0,
          mutation,
        });
        const command = {
          id: `cmd_${i}`,
          commandName: 'replayed',
          payload: '{}',
          contractVersion: '1.0.0',
          aggregateId: key.aggregateId,
          aggregateVersion: '1.0.0',
          aggregateName: 'user',
          systemName: 'system-worker',
          userId: null,
          sessionId: null,
          frontendName: null,
          pushIndex: null,
          aggregateIndex: i + 1,
          chainedAt: time,
          delta: null,
          failedAt: null,
          failure: null,
          dispositionHash: 'a'.repeat(64),
        };
        const entry = yield* Schema.encodeUnknownEffect(
          Schema.fromJsonString(AggregateExecutionEntrySchema),
        )({
          sourceCommand: JSON.stringify(command),
          command,
          mutations: [encoded],
          preparationVersion: '1.0.0',
          executionTimestamp: time,
        });
        return { outboxIndex: i + 1, entry, executionVersion: '1.0.0' };
      }),
    ),
  );
  const outputs = [];
  for (const pageSize of [1, 2, 6]) {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeResourceDbConfig({
          otherTables: userVersionedAggregateRepoTables,
          models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    for (let i = 0; i < rows.length; i += pageSize) {
      await Effect.runPromise(
        execute({ db, key, rows: rows.slice(i, i + pageSize) }),
      );
    }
    await Effect.runPromise(execute({ db, key, rows }));
    const deltas = db
      .select()
      .from(userVersionedAggregateRepoDbConfig.schema.deltas)
      .all();
    expect(deltas).toHaveLength(6);
    const decoded = deltas.map(row => JSON.parse(row.output));
    expect(
      decoded[4].delta.deleted.map((row: { id: string }) => row.id).sort(),
    ).toEqual(['lst_test', 'tsk_test']);
    expect(
      decoded[5].delta.inserted.map((row: { id: string }) => row.id).sort(),
    ).toEqual(['lst_test', 'tsk_test']);
    expect(decoded[1].delta).toEqual({
      inserted: [],
      updated: [],
      deleted: [],
      mutations: [],
    });
    outputs.push(deltas.map(row => row.output));
  }
  expect(outputs[1]).toEqual(outputs[0]);
  expect(outputs[2]).toEqual(outputs[0]);
});
