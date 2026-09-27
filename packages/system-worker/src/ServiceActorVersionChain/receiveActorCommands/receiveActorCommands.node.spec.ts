import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect, Result } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeActorSnapshotDb } from '../../AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.js';
import { serviceActorVersionChainDbConfig } from '../serviceActorVersionChainDbConfig.js';

import { receiveActorCommands } from './receiveActorCommands.js';

describe('service actor publication', () => {
  it('copies encoded actorDelta and broadcasts a retained duplicate', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* makeActorSnapshotDb(
          serviceActorVersionChainDbConfig,
        );
        const row =
          yield* serviceActorVersionChainDbConfig.tables.commands.encodeRow({
            rowId: 'row_one',
            id: 'cmd_one',
            commandName: 'example',
            contractVersion: '1.0.0',
            payload: '{}',
            serviceName: 'example',
            serviceVersion: '1.0.0',
            automationName: null,
            serviceIndex: 1,
            admission: null,
            execution: null,
            dispositionHash: null,
            actorServiceIndex: 1,
            serviceHash: 'a'.repeat(64),
            actorDelta: { upserted: [], deleted: [] },
            acknowledgedAt: null,
            lastDeliveryFailure: null,
          });
        const broadcasts: unknown[] = [];
        const publish = () =>
          receiveActorCommands({
            db,
            rows: [row],
            broadcast: command => {
              broadcasts.push(command);
            },
          });
        yield* publish();
        yield* publish();
        const retained = db
          .select()
          .from(serviceActorVersionChainDbConfig.schema.commands)
          .all();
        expect(retained).toHaveLength(1);
        expect(retained[0]?.actorDelta).toBe(row.actorDelta);
        expect(broadcasts).toHaveLength(2);
        expect(broadcasts[0]).toMatchObject({
          actorDelta: { upserted: [], deleted: [] },
        });
        const conflicting = yield* receiveActorCommands({
          db,
          rows: [{ ...row, payload: '{"changed":true}' }],
          broadcast: () => {
            throw new Error('unexpected broadcast');
          },
        }).pipe(Effect.result);
        expect(Result.isFailure(conflicting) && conflicting.failure.code).toBe(
          'session-output-identity-mismatch',
        );
        const invalid = yield* receiveActorCommands({
          db,
          rows: [{ ...row, id: 'bad', serviceIndex: 2 }],
          broadcast: () => {
            throw new Error('unexpected broadcast');
          },
        }).pipe(Effect.result);
        expect(Result.isFailure(invalid) && invalid.failure.code).toBe(
          'session-output-invalid',
        );
        expect(
          db
            .select()
            .from(serviceActorVersionChainDbConfig.schema.commands)
            .all(),
        ).toHaveLength(1);
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  });
});
