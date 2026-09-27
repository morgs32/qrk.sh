import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { Effect } from 'effect';
import { expect, it, vi } from 'vitest';

import { game } from '../../workerd-utils/automationFixture.js';
import { aggregateActorVersionRepoDbConfig } from '../aggregateActorVersionRepoDbConfig.js';
import { makeActorSnapshotDb } from '../validateCommands/makeActorSnapshotDb.js';

import { makeOptimisticActorDb } from './makeOptimisticActorDb.js';
import { stageActorCommands } from './stageActorCommands.js';

vi.mock('config', async () => {
  const { makeSystem } =
    await import('@zerospin/core/system/make/makeSystem/makeSystem');
  const { makeSystemConfig } =
    await import('@zerospin/core/system/make/makeSystemConfig');
  const { automationGame, AutomationDecision } =
    await import('../../workerd-utils/automationFixture.js');
  const { Effect, Layer } = await import('effect');
  return {
    default: makeSystemConfig(
      makeSystem({
        name: 'automations',
        aggregates: { automationGame: { '1.0.0': automationGame } },
        layer: Layer.succeed(AutomationDecision, () => Effect.succeed(null)),
      }),
      { systemId: 'sys_automations' },
    ),
  };
});

const key = {
  systemId: 'sys_automations',
  aggregateId: 'acct_game',
  aggregateName: 'automationGame',
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
            models: { automationGame: game },
            otherTables: aggregateActorVersionRepoDbConfig.tables,
          }),
        );
        const command = {
          id: 'cmd_staged' as const,
          commandName: 'automationCreate',
          contractVersion: '1.0.0',
          payload: JSON.stringify({ id: 'gam_selected', value: 3 }),
          aggregateId: key.aggregateId,
          aggregateName: key.aggregateName,
          aggregateVersion: key.aggregateVersion,
          systemName: 'automations',
          actorName: key.actorName,
          actorVersion: key.actorVersion,
          identity: {
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
        expect(db.db.query.automationGame?.findFirst().sync()).toBeUndefined();
        const pending =
          yield* aggregateActorVersionRepoDbConfig.tables.pendingCommands.decodeRow(
            db.db
              .select()
              .from(aggregateActorVersionRepoDbConfig.schema.pendingCommands)
              .get(),
          );
        expect(pending.mutations).toHaveLength(1);
        const optimistic = yield* makeOptimisticActorDb({
          authoritativeDb: db.db,
          models: { automationGame: game },
          pending: [
            {
              commandId: command.id,
              appliedAt: pending.stagedAt,
              mutations: pending.mutations,
            },
          ],
        });
        expect(
          optimistic.db.query.automationGame?.findFirst().sync(),
        ).toMatchObject({
          id: 'gam_selected',
          value: 3,
        });
      }),
    ).pipe(Effect.provide(AsyncLive)),
  );
});
