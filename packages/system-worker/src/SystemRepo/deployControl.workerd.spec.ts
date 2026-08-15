import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { env, runInDurableObject } from 'cloudflare:test';
import { getTableColumns } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { system } from '../fixtures/system.js';
import { managedRuntime } from '../managedRuntime.js';

import { getDeploy } from './getDeploy/getDeploy.js';
import { initializeSystemRepo } from './initializeSystemRepo.js';
import { migrateSystemRepo } from './migrateSystemRepo.js';
import { startDeploy } from './startDeploy/startDeploy.js';
import {
  SystemRepo,
  systemRepoDbConfig,
  systemRepoDrizzleSchemas,
} from './SystemRepo.js';

describe('SystemRepo deploy control boundary', () => {
  it('rejects deploy mutation and status reads for a Production configuration', async () => {
    const systemRepo = SystemRepo.getRepo({ systemId: env.ZEROSPIN_SYSTEM_ID });
    const settled = await runInDurableObject(systemRepo, (_instance, state) =>
      managedRuntime.runPromise(
        Effect.gen(function* () {
          const { db } = yield* initializeSystemRepo({
            storage: state.storage,
            dbConfig: systemRepoDbConfig,
          });
          yield* migrateSystemRepo({
            db,
            schema: systemRepoDbConfig.schema,
          });
          const startResult = yield* startDeploy({
            db,
            request: { clean: false },
            readiness: Promise.resolve(),
            environment: 'production',
            workerVersionId: env.WORKER_VERSION_METADATA.id,
            systemSpec: makeSystemSpec({ system }),
            scheduleActivation: async () => undefined,
            selectionTable: systemRepoDrizzleSchemas.selection,
            selectionColumns: getTableColumns(
              systemRepoDrizzleSchemas.selection,
            ),
            deployTable: systemRepoDrizzleSchemas.deploy,
            deployColumns: getTableColumns(systemRepoDrizzleSchemas.deploy),
          }).pipe(Effect.either);
          const getResult = yield* getDeploy({
            db,
            request: { deployId: 'dpl_rejected_production' },
            readiness: Promise.resolve(),
            environment: 'production',
            scheduleActivation: async () => undefined,
            deployTable: systemRepoDrizzleSchemas.deploy,
            deployColumns: getTableColumns(systemRepoDrizzleSchemas.deploy),
          }).pipe(Effect.either);
          return { getResult, startResult };
        }),
      ),
    );

    expect(settled.startResult._tag).toBe('Left');
    if (settled.startResult._tag === 'Left') {
      expect(settled.startResult.left).toMatchObject({
        code: 'system-deploy-control-unavailable',
        status: 400,
      });
    }
    expect(settled.getResult._tag).toBe('Left');
    if (settled.getResult._tag === 'Left') {
      expect(settled.getResult.left).toMatchObject({
        code: 'system-deploy-control-unavailable',
        status: 400,
      });
    }
  });
});
