import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import {
  game,
  playX,
} from '@zerospin/fixtures/system-worker/workerd/machineFixture';
import { Effect } from 'effect';
import { expect, it, vi } from 'vitest';

import { aggregateActorVersionRepoDbConfig } from '../aggregateActorVersionRepoDbConfig.js';
import { makeActorSnapshotDb } from '../validateCommands/makeActorSnapshotDb.js';

import { makeOptimisticActorDb } from './makeOptimisticActorDb.js';
import { stageActorCommands } from './stageActorCommands.js';

vi.mock('config', async () => {
  const { makeSystem } =
    await import('@zerospin/core/system/make/makeSystem/makeSystem');
  const { makeSystemConfig } =
    await import('@zerospin/core/system/make/makeSystemConfig');
  const { machineGame, MachineDecision } =
    await import('@zerospin/fixtures/system-worker/workerd/machineFixture');
  const { Effect, Layer } = await import('effect');
  return {
    default: makeSystemConfig(
      makeSystem({
        name: 'machines',
        aggregates: { machineGame: { '1.0.0': machineGame } },
        layer: Layer.succeed(MachineDecision, () => Effect.succeed(null)),
      }),
      { systemId: 'sys_machines' },
    ),
  };
});

const key = {
  systemId: 'sys_machines',
  aggregateId: 'acct_game',
  aggregateName: 'machineGame',
  aggregateVersion: '1.0.0',
  actorName: 'human',
  actorVersion: '1.0.0',
  actorPath: '/acct_game/gam_selected',
};

it('durably stages prepared mutations while leaving resource rows authoritative', async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* makeActorSnapshotDb(
          makeResourceDbConfig({
            models: { machineGame: game },
            otherTables: aggregateActorVersionRepoDbConfig.tables,
          }),
        );
        const command = {
          id: 'cmd_staged' as const,
          commandName: 'machineCreate',
          contractVersion: '1.0.0',
          payload: JSON.stringify({ id: 'gam_selected', value: 3 }),
          aggregateId: key.aggregateId,
          aggregateName: key.aggregateName,
          aggregateVersion: key.aggregateVersion,
          systemName: 'machines',
          actorName: key.actorName,
          actorVersion: key.actorVersion,
          claims: {
            aggregateId: key.aggregateId,
            instanceId: 'gam_selected',
          },
          nodeId: null,
          sessionName: null,
          nodeIndex: null,
        };
        const result = yield* stageActorCommands({
          db: db.db,
          key,
          commands: [command],
        });
        expect(result).toEqual([
          { commandId: command.id, stagingFailure: null },
        ]);
        expect(db.db.query.machineGame?.findFirst().sync()).toBeUndefined();
        const pending =
          yield* aggregateActorVersionRepoDbConfig.tables.pendingCommands.decodeRow(
            db.db
              .select()
              .from(aggregateActorVersionRepoDbConfig.schema.pendingCommands)
              .get(),
          );
        expect(pending.mutations).toHaveLength(1);
        const originalProgram = playX.program;
        const program = vi.spyOn(playX, 'program').mockImplementation(props => {
          const before = props.db.query.machineGame.findFirst().sync();
          if (!before) throw new Error('Missing optimistic game');
          return originalProgram({
            ...props,
            payload: {
              ...props.payload,
              value: before.value + props.payload.value,
            },
          });
        });
        try {
          const second = yield* stageActorCommands({
            db: db.db,
            key,
            commands: [
              {
                ...command,
                id: 'cmd_increment',
                commandName: 'machinePlayX',
                payload: JSON.stringify({ id: 'gam_selected', value: 4 }),
              },
            ],
          });
          expect(second).toEqual([
            { commandId: 'cmd_increment', stagingFailure: null },
          ]);
          expect(program).toHaveBeenCalledOnce();
          const rows = db.db
            .select()
            .from(aggregateActorVersionRepoDbConfig.schema.pendingCommands)
            .all();
          const secondRow = rows
            .toSorted((a, b) => a.stageIndex - b.stageIndex)
            .at(-1);
          const decoded =
            yield* aggregateActorVersionRepoDbConfig.tables.pendingCommands.decodeRow(
              secondRow,
            );
          expect(
            decoded.mutations.map(mutation => JSON.parse(mutation.operation)),
          ).toMatchObject([{ encodedAttributes: { value: 7 } }]);
          expect(
            db.db.query.machineGame?.findFirst().sync(),
          ).toBeUndefined();
        } finally {
          program.mockRestore();
        }
        const optimistic = yield* makeOptimisticActorDb({
          authoritativeDb: db.db,
          models: { machineGame: game },
          pending: [
            {
              commandId: command.id,
              appliedAt: pending.stagedAt,
              mutations: pending.mutations,
            },
          ],
        });
        expect(
          optimistic.db.query.machineGame?.findFirst().sync(),
        ).toMatchObject({
          id: 'gam_selected',
          value: 3,
        });
      }),
    ).pipe(Effect.provide(AsyncLive)),
  );
});
