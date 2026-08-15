import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { SystemRepo } from './SystemRepo.js';

describe('SystemRepo fresh singleton schema', () => {
  it('creates only the consolidated current tables and ticket identities', async () => {
    const systemRepo = SystemRepo.getRepo({ systemId: env.ZEROSPIN_SYSTEM_ID });
    await systemRepo.getReadiness();

    await runInDurableObject(systemRepo, (_instance, state) => {
      const tableNames = state.storage.sql
        .exec<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .toArray()
        .map(row => row.name);
      expect(tableNames).toEqual([
        'aggregateFrontendWebSocketTickets',
        'aggregates',
        'deploy',
        'drainBounds',
        'generationState',
        'replayCompletions',
        'repos',
        'selection',
        'serviceFrontendWebSocketTickets',
        'systemWrites',
      ]);

      const deployColumns = state.storage.sql
        .exec<{ name: string }>('PRAGMA table_info(deploy)')
        .toArray()
        .map(row => row.name);
      expect(deployColumns).toEqual([
        'id',
        'prevDeployId',
        'generationId',
        'workerVersionId',
        'systemSpec',
        'clean',
        'status',
        'activationCheckpoint',
        'failure',
        'startedAt',
        'completedAt',
      ]);
      const deployIdentityIndex = state.storage.sql
        .exec<{ name: string; unique: number }>('PRAGMA index_list(deploy)')
        .toArray()
        .find(row => row.name === 'deploy_workerVersionId_clean_unique');
      expect(deployIdentityIndex).toMatchObject({ unique: 1 });
      expect(
        state.storage.sql
          .exec<{ name: string }>(
            'PRAGMA index_info(deploy_workerVersionId_clean_unique)',
          )
          .toArray()
          .map(row => row.name),
      ).toEqual(['workerVersionId', 'clean']);

      const drainBoundColumns = state.storage.sql
        .exec<{ name: string }>('PRAGMA table_info(drainBounds)')
        .toArray()
        .map(row => row.name);
      expect(drainBoundColumns).toEqual([
        'generationId',
        'repoType',
        'sourceRepoName',
        'targetRepoName',
        'terminalCursor',
        'terminalIndex',
        'capturedAt',
      ]);

      const selectionColumns = state.storage.sql
        .exec<{ name: string }>('PRAGMA table_info(selection)')
        .toArray()
        .map(row => row.name);
      expect(selectionColumns).toEqual([
        'id',
        'activeDeployId',
        'activatingDeployId',
        'writeGenerationId',
        'lastWriteIndex',
        'lastCleanRequestId',
      ]);

      const generationColumns = state.storage.sql
        .exec<{ name: string }>('PRAGMA table_info(generationState)')
        .toArray()
        .map(row => row.name);
      expect(generationColumns).toEqual([
        'generationId',
        'prevGenerationId',
        'successorGenerationId',
        'initialDeployId',
        'activeDeployId',
        'preparingDeployId',
        'phase',
        'lastWriteIndex',
        'activeSystemSpec',
        'preparingSystemSpec',
        'failure',
        'createdAt',
        'readyAt',
        'openedAt',
        'drainFrozenAt',
        'retirementCompletedAt',
        'retiredAt',
      ]);

      const frontendTicketColumns = state.storage.sql
        .exec<{ name: string }>(
          'PRAGMA table_info(aggregateFrontendWebSocketTickets)',
        )
        .toArray()
        .map(row => row.name);
      expect(frontendTicketColumns).toEqual([
        'ticketHash',
        'generationId',
        'repoName',
        'aggregateId',
        'aggregateName',
        'userId',
        'frontendName',
        'aggregateFrontendLock',
        'expiresAt',
      ]);
      expect(frontendTicketColumns).not.toContain('deployId');
      expect(frontendTicketColumns).not.toContain('workerVersionId');

      const systemWriteColumns = state.storage.sql
        .exec<{ name: string; pk: number }>('PRAGMA table_info(systemWrites)')
        .toArray()
        .map(row => ({ name: row.name, pk: row.pk }));
      expect(systemWriteColumns).toEqual([
        { name: 'writeIndex', pk: 1 },
        { name: 'generationId', pk: 0 },
        { name: 'operation', pk: 0 },
        { name: 'target', pk: 0 },
        { name: 'commands', pk: 0 },
        { name: 'result', pk: 0 },
        { name: 'deliveryAttemptCount', pk: 0 },
        { name: 'lastDeliveryFailure', pk: 0 },
        { name: 'createdAt', pk: 0 },
        { name: 'lastDeliveryAttemptAt', pk: 0 },
        { name: 'resolvedAt', pk: 0 },
      ]);
    });
  });

  it('qualifies coordination uniqueness by generation', async () => {
    const systemRepo = SystemRepo.getRepo({ systemId: env.ZEROSPIN_SYSTEM_ID });
    await systemRepo.getReadiness();

    await runInDurableObject(systemRepo, (_instance, state) => {
      state.storage.sql.exec(
        `INSERT INTO drainBounds
           (generationId, repoType, sourceRepoName, targetRepoName, capturedAt)
         VALUES (?, 'ServiceBlockSubscriber', 'sbrepo_shared', 'arepo_shared', ?),
                (?, 'ServiceBlockSubscriber', 'sbrepo_shared', 'arepo_shared', ?)`,
        'gen_schema_one',
        1,
        'gen_schema_two',
        2,
      );
      expect(
        state.storage.sql
          .exec<{ count: number }>(
            "SELECT COUNT(*) AS count FROM drainBounds WHERE sourceRepoName = 'sbrepo_shared'",
          )
          .one().count,
      ).toBe(2);
      expect(() =>
        state.storage.sql.exec(
          `INSERT INTO drainBounds
             (generationId, repoType, sourceRepoName, targetRepoName, capturedAt)
           VALUES (?, 'ServiceBlockSubscriber', 'sbrepo_shared', 'arepo_shared', ?)`,
          'gen_schema_one',
          3,
        ),
      ).toThrow();

      state.storage.sql.exec(
        `INSERT INTO repos (generationId, repoType, repoName, tableNames)
         VALUES (?, 'ServiceRepo', 'srepo_shared', '[]'),
                (?, 'ServiceRepo', 'srepo_shared', '[]')`,
        'gen_schema_one',
        'gen_schema_two',
      );
      expect(
        state.storage.sql
          .exec<{ count: number }>(
            "SELECT COUNT(*) AS count FROM repos WHERE repoName = 'srepo_shared'",
          )
          .one().count,
      ).toBe(2);
    });
  });
});
