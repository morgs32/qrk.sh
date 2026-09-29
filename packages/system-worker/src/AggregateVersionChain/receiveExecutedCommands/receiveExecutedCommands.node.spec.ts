import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect, Result } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeActorSnapshotDb } from '../../AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.js';
import {
  advanceDispositionHash,
  genesisDispositionHash,
} from '../../aggregateDispositionHash/aggregateDispositionHash.js';
import { aggregateVersionRepoDbConfig } from '../../AggregateVersionRepo/aggregateVersionRepoDbConfig.js';
import { aggregateVersionChainDbConfig } from '../aggregateVersionChainDbConfig.js';

import { receiveExecutedCommands } from './receiveExecutedCommands.js';

const aggregateCommand = () =>
  aggregateVersionRepoDbConfig.tables.aggregateCommands.encodeRow({
    id: 'cmd_one',
    commandName: 'change',
    payload: '{}',
    contractVersion: 'v1',
    aggregateId: 'acct_one',
    aggregateName: 'account',
    systemName: 'test',
    aggregateVersion: 'v1',
    nodeId: null,
    actorName: 'owner',
    actorVersion: 'v1',
    claims: { aggregateId: 'acct_one' },
    sessionName: null,
    nodeIndex: null,
    admission: {
      status: 'succeeded',
      startedAt: new Date('2026-09-25T12:00:00.000Z'),
      completedAt: new Date('2026-09-25T12:00:01.000Z'),
    },
    dispositionHash: advanceDispositionHash({
      previousDispositionHash: genesisDispositionHash(),
      aggregateIndex: 1,
      commandId: 'cmd_one',
      disposition: 'success',
      failure: null,
    }),
    execution: {
      status: 'succeeded',
      startedAt: new Date('2026-09-25T12:00:00.000Z'),
      completedAt: new Date('2026-09-25T12:00:01.000Z'),
      executionDelta: { inserted: [], updated: [], deleted: [] },
    },
    executedIndex: 1,
    aggregateIndex: 1,
    executionVersion: 'v1',
    acknowledgedAt: null,
    lastDeliveryFailure: null,
  });

const serviceCommand = () =>
  aggregateVersionRepoDbConfig.tables.serviceCommands.encodeRow({
    id: 'cmd_service',
    commandName: 'sync',
    payload: '{}',
    contractVersion: 'v1',
    admission: {
      status: 'succeeded',
      startedAt: new Date('2026-09-25T12:00:00.000Z'),
      completedAt: new Date('2026-09-25T12:00:01.000Z'),
    },
    dispositionHash: 'b'.repeat(64),
    execution: {
      status: 'succeeded',
      startedAt: new Date('2026-09-25T12:00:00.000Z'),
      completedAt: new Date('2026-09-25T12:00:01.000Z'),
      executionDelta: { inserted: [], updated: [], deleted: [] },
    },
    executedIndex: 2,
    serviceName: 'inventory',
    serviceVersion: 'v1',
    serviceIndex: 1,
    executionVersion: 'v1',
    acknowledgedAt: null,
    lastDeliveryFailure: null,
  });

describe('aggregate version publication', () => {
  it('retains applied rows and rejects conflicting retries', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* makeActorSnapshotDb(
          aggregateVersionChainDbConfig,
        );
        const row = yield* aggregateCommand();
        const mutation =
          yield* aggregateVersionRepoDbConfig.tables.mutations.encodeRow({
            id: '1/0',
            executedIndex: 1,
            commandId: row.id,
            mutationIndex: 0,
            modelName: 'item',
            modelVersion: '1.0.0',
            resourceId: 'itm_one',
            operationName: 'create',
            operation: '{}',
            inverseOperation: 'null',
            appliedAt: new Date('2026-09-25T12:00:00.000Z'),
            previousUpdatedAt: null,
          });
        const receive = (operation: typeof mutation) =>
          receiveExecutedCommands({
            db,
            key: {
              aggregateId: 'acct_one',
              aggregateName: 'account',
              aggregateVersion: 'v1',
            },
            rows: [{ ...row, mutations: [operation] }],
          });
        yield* receive(mutation);
        yield* receive(mutation);
        expect(
          db
            .select()
            .from(aggregateVersionChainDbConfig.schema.mutations)
            .all(),
        ).toEqual([mutation]);
        const conflict = yield* receive({
          ...mutation,
          operation: '{"changed":true}',
        }).pipe(Effect.result);
        expect(Result.isFailure(conflict) && conflict.failure.code).toBe(
          'finalized-mutation-conflict',
        );
        expect(
          db
            .select()
            .from(aggregateVersionChainDbConfig.schema.mutations)
            .all(),
        ).toEqual([mutation]);
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  });

  it('retains encoded aggregate and service rows, accepts identical retries, and rejects conflicts', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* makeActorSnapshotDb(
          aggregateVersionChainDbConfig,
        );
        const first = yield* aggregateCommand();
        const service = yield* serviceCommand();
        const receive = (rows: (typeof first | typeof service)[]) =>
          receiveExecutedCommands({
            db,
            key: {
              aggregateId: 'acct_one',
              aggregateName: 'account',
              aggregateVersion: 'v1',
            },
            rows: rows.map(row => ({ ...row, mutations: [] })),
          });
        yield* receive([first, service]);
        yield* receive([first, service]);
        const retained = db
          .select()
          .from(aggregateVersionChainDbConfig.schema.aggregateCommands)
          .all();
        const retainedService = db
          .select()
          .from(aggregateVersionChainDbConfig.schema.serviceCommands)
          .all();
        expect(retained).toHaveLength(1);
        expect(retainedService).toHaveLength(1);
        expect(retained[0]?.execution).toBe(first.execution);
        expect(retainedService[0]?.execution).toBe(service.execution);
        const conflict = yield* receive([
          { ...first, payload: '{"different":true}' },
        ]).pipe(Effect.result);
        expect(Result.isFailure(conflict) && conflict.failure.code).toBe(
          'finalized-command-conflict',
        );
        expect(
          db
            .select()
            .from(aggregateVersionChainDbConfig.schema.aggregateCommands)
            .all(),
        ).toHaveLength(1);
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  });
});
