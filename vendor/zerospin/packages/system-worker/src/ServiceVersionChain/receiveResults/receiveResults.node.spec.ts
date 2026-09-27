import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect, Result } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeActorSnapshotDb } from '../../AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.js';
import {
  advanceDispositionHash,
  genesisDispositionHash,
} from '../../serviceDispositionHash/serviceDispositionHash.js';
import { serviceVersionRepoDbConfig } from '../../ServiceVersionRepo/serviceVersionRepoDbConfig.js';
import { serviceVersionChainDbConfig } from '../serviceVersionChainDbConfig.js';

import { receiveResults } from './receiveResults.js';

const command = (serviceIndex: number) =>
  serviceVersionRepoDbConfig.tables.commands.encodeRow({
    id: `cmd_${serviceIndex}`,
    commandName: 'update',
    payload: '{}',
    contractVersion: 'v1',
    serviceName: 'inventory',
    serviceVersion: 'v1',
    admission: {
      status: 'succeeded',
      startedAt: new Date('2026-09-25T12:00:00.000Z'),
      completedAt: new Date('2026-09-25T12:00:01.000Z'),
    },
    dispositionHash: advanceDispositionHash({
      failure: null,
      previousDispositionHash: genesisDispositionHash(),
      serviceIndex,
      commandId: `cmd_${serviceIndex}`,
      disposition: 'success',
    }),
    execution: {
      status: 'succeeded',
      startedAt: new Date('2026-09-25T12:00:00.000Z'),
      completedAt: new Date('2026-09-25T12:00:01.000Z'),
      executionDelta: { inserted: [], updated: [], deleted: [] },
    },
    serviceIndex,
    executionVersion: 'v1',
    acknowledgedAt: null,
    lastDeliveryFailure: null,
  });

describe('service version result publication', () => {
  it('retains an applied operation with its command and rejects a conflicting retry', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* makeActorSnapshotDb(serviceVersionChainDbConfig);
        const row = yield* command(1);
        const mutation =
          yield* serviceVersionRepoDbConfig.tables.mutations.encodeRow({
            id: '1/0',
            serviceIndex: 1,
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
          receiveResults({
            db,
            key: { serviceName: 'inventory', serviceVersion: 'v1' },
            rows: [{ ...row, mutations: [operation] }],
          });
        yield* receive(mutation);
        yield* receive(mutation);
        expect(
          db.select().from(serviceVersionChainDbConfig.schema.mutations).all(),
        ).toEqual([mutation]);
        const conflict = yield* receive({
          ...mutation,
          operation: '{"changed":true}',
        }).pipe(Effect.result);
        expect(Result.isFailure(conflict) && conflict.failure.code).toBe(
          'finalized-command-conflict',
        );
        expect(
          db.select().from(serviceVersionChainDbConfig.schema.mutations).all(),
        ).toEqual([mutation]);
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  });

  it('copies encoded fields and keeps retry, gap, and hash behavior', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* makeActorSnapshotDb(serviceVersionChainDbConfig);
        const first = yield* command(1);
        const receive = (rows: (typeof first)[]) =>
          receiveResults({
            db,
            key: { serviceName: 'inventory', serviceVersion: 'v1' },
            rows: rows.map(row => ({ ...row, mutations: [] })),
          });
        yield* receive([first]);
        yield* receive([first]);
        const retained = db
          .select()
          .from(serviceVersionChainDbConfig.schema.commands)
          .all();
        expect(retained).toHaveLength(1);
        expect(retained[0]?.execution).toBe(first.execution);
        const third = yield* command(3);
        const gap = yield* receive([third]).pipe(Effect.result);
        expect(Result.isFailure(gap) && gap.failure.code).toBe(
          'finalized-command-gap',
        );
        const second = yield* command(2);
        const hash = yield* receive([second]).pipe(Effect.result);
        expect(Result.isFailure(hash) && hash.failure.code).toBe(
          'finalized-command-hash-mismatch',
        );
        expect(
          db.select().from(serviceVersionChainDbConfig.schema.commands).all(),
        ).toHaveLength(1);
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  });
});
