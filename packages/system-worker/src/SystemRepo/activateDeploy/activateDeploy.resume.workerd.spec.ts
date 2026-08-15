import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { ZerospinError } from '@zerospin/error';
import {
  abortAllDurableObjects,
  env,
  runInDurableObject,
} from 'cloudflare:test';
import { eq, getTableColumns, getTableName } from 'drizzle-orm';
import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';

import { system } from '../../fixtures/system.js';
import { managedRuntime } from '../../managedRuntime.js';
import { allocateDeploy } from '../allocateDeploy/allocateDeploy.js';
import { freezeGeneration } from '../freezeGeneration/freezeGeneration.js';
import { initializeSystemRepo } from '../initializeSystemRepo.js';
import { migrateSystemRepo } from '../migrateSystemRepo.js';
import { prepareGeneration } from '../prepareGeneration/prepareGeneration.js';
import {
  SystemRepo,
  systemRepoDbConfig,
  systemRepoDrizzleSchemas,
} from '../SystemRepo.js';

import { activateDeploy } from './activateDeploy.js';

afterEach(() => abortAllDurableObjects());

describe('SystemRepo activation durable resume', () => {
  it.each([
    'allocated',
    'generation-prepared',
    'final-replay-complete',
  ] as const)('cold-resumes an initial root from %s', checkpoint =>
    managedRuntime.runPromise(
      Effect.gen(function* () {
        const workerVersionId = `resume-${checkpoint}`;
        const systemSpec = makeSystemSpec({ system });
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });

        yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) =>
            managedRuntime.runPromise(
              Effect.gen(function* () {
                const { db } = yield* initializeSystemRepo({
                  storage: state.storage,
                  dbConfig: systemRepoDbConfig,
                });
                for (const table of Object.values(systemRepoDrizzleSchemas)) {
                  state.storage.sql.exec(
                    `DROP TABLE IF EXISTS "${getTableName(table)}"`,
                  );
                }
                yield* migrateSystemRepo({
                  db,
                  schema: systemRepoDbConfig.schema,
                });
                const allocation = yield* allocateDeploy({
                  db,
                  workerVersionId,
                  clean: false,
                  cleanRequestId: null,
                  systemSpec,
                  selectionTable: systemRepoDrizzleSchemas.selection,
                  selectionColumns: getTableColumns(
                    systemRepoDrizzleSchemas.selection,
                  ),
                  deployTable: systemRepoDrizzleSchemas.deploy,
                  deployColumns: getTableColumns(
                    systemRepoDrizzleSchemas.deploy,
                  ),
                });
                const candidate = db
                  .select()
                  .from(systemRepoDrizzleSchemas.deploy)
                  .where(
                    eq(systemRepoDrizzleSchemas.deploy.id, allocation.deployId),
                  )
                  .get();
                expect(candidate).toBeDefined();
                if (candidate === undefined) {
                  return;
                }

                if (checkpoint !== 'allocated') {
                  yield* prepareGeneration({
                    db,
                    activationGuard: Effect.void,
                    configuredSystemId: env.ZEROSPIN_SYSTEM_ID,
                    deployId: candidate.id,
                    generationId: candidate.generationId,
                    prevGenerationId: null,
                    restoreSubscriptions: false,
                    systemSpec,
                    seeds: [],
                    submitTargetedSeed: () => Effect.void,
                    drainSystemWrites: () => Effect.void,
                    generationStateTable:
                      systemRepoDrizzleSchemas.generationState,
                    generationStateColumns: getTableColumns(
                      systemRepoDrizzleSchemas.generationState,
                    ),
                    replayCompletionsTable:
                      systemRepoDrizzleSchemas.replayCompletions,
                    replayCompletionsColumns: getTableColumns(
                      systemRepoDrizzleSchemas.replayCompletions,
                    ),
                    repoTable: systemRepoDrizzleSchemas.repos,
                  });
                  db.update(systemRepoDrizzleSchemas.deploy)
                    .set({ activationCheckpoint: 'generation-prepared' })
                    .where(eq(systemRepoDrizzleSchemas.deploy.id, candidate.id))
                    .run();
                }
                if (checkpoint === 'final-replay-complete') {
                  yield* freezeGeneration({
                    db,
                    activationGuard: Effect.void,
                    deployId: candidate.id,
                    generationId: candidate.generationId,
                    throughWriteIndex: null,
                    drainSystemWrites: () => Effect.void,
                    generationStateTable:
                      systemRepoDrizzleSchemas.generationState,
                    generationStateColumns: getTableColumns(
                      systemRepoDrizzleSchemas.generationState,
                    ),
                    drainBoundsTable: systemRepoDrizzleSchemas.drainBounds,
                    drainBoundsColumns: getTableColumns(
                      systemRepoDrizzleSchemas.drainBounds,
                    ),
                    repoTable: systemRepoDrizzleSchemas.repos,
                  });
                  db.update(systemRepoDrizzleSchemas.deploy)
                    .set({ activationCheckpoint: 'final-replay-complete' })
                    .where(eq(systemRepoDrizzleSchemas.deploy.id, candidate.id))
                    .run();
                }

                yield* activateDeploy({
                  db,
                  configuredSystemId: env.ZEROSPIN_SYSTEM_ID,
                  executingWorkerVersionId: workerVersionId,
                  deployId: candidate.id,
                  cleanRequestId: null,
                  submitTargetedSeed: () => Effect.void,
                  drainSystemWrites: () => Effect.void,
                  selectionTable: systemRepoDrizzleSchemas.selection,
                  selectionColumns: getTableColumns(
                    systemRepoDrizzleSchemas.selection,
                  ),
                  deployTable: systemRepoDrizzleSchemas.deploy,
                  deployColumns: getTableColumns(
                    systemRepoDrizzleSchemas.deploy,
                  ),
                  generationStateTable:
                    systemRepoDrizzleSchemas.generationState,
                  generationStateColumns: getTableColumns(
                    systemRepoDrizzleSchemas.generationState,
                  ),
                  drainBoundsTable: systemRepoDrizzleSchemas.drainBounds,
                  drainBoundsColumns: getTableColumns(
                    systemRepoDrizzleSchemas.drainBounds,
                  ),
                  replayCompletionsTable:
                    systemRepoDrizzleSchemas.replayCompletions,
                  replayCompletionsColumns: getTableColumns(
                    systemRepoDrizzleSchemas.replayCompletions,
                  ),
                  repoTable: systemRepoDrizzleSchemas.repos,
                });

                expect(
                  db
                    .select()
                    .from(systemRepoDrizzleSchemas.deploy)
                    .where(eq(systemRepoDrizzleSchemas.deploy.id, candidate.id))
                    .get(),
                ).toMatchObject({ status: 'succeeded', failure: null });
                expect(
                  db.select().from(systemRepoDrizzleSchemas.selection).get(),
                ).toMatchObject({
                  activeDeployId: candidate.id,
                  activatingDeployId: null,
                  writeGenerationId: candidate.generationId,
                });
                expect(
                  db
                    .select()
                    .from(systemRepoDrizzleSchemas.generationState)
                    .where(
                      eq(
                        systemRepoDrizzleSchemas.generationState.generationId,
                        candidate.generationId,
                      ),
                    )
                    .get(),
                ).toMatchObject({
                  phase: 'open',
                  activeDeployId: candidate.id,
                });
              }),
            ),
          ),
        );
      }),
    ),
  );

  it('keeps a linked deploy activating after the ownership cut and cold-resumes it', () =>
    managedRuntime.runPromise(
      Effect.gen(function* () {
        const currentSystemSpec = makeSystemSpec({ system });
        const historicalSystemSpec = structuredClone(currentSystemSpec);
        historicalSystemSpec.version = '0.9.0';
        Reflect.deleteProperty(historicalSystemSpec.services, 'inventory');
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });

        yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) =>
            managedRuntime.runPromise(
              Effect.gen(function* () {
                const { db } = yield* initializeSystemRepo({
                  storage: state.storage,
                  dbConfig: systemRepoDbConfig,
                });
                for (const table of Object.values(systemRepoDrizzleSchemas)) {
                  state.storage.sql.exec(
                    `DROP TABLE IF EXISTS "${getTableName(table)}"`,
                  );
                }
                yield* migrateSystemRepo({
                  db,
                  schema: systemRepoDbConfig.schema,
                });
                const common = {
                  db,
                  configuredSystemId: env.ZEROSPIN_SYSTEM_ID,
                  cleanRequestId: null,
                  submitTargetedSeed: () => Effect.void,
                  selectionTable: systemRepoDrizzleSchemas.selection,
                  selectionColumns: getTableColumns(
                    systemRepoDrizzleSchemas.selection,
                  ),
                  deployTable: systemRepoDrizzleSchemas.deploy,
                  deployColumns: getTableColumns(
                    systemRepoDrizzleSchemas.deploy,
                  ),
                  generationStateTable:
                    systemRepoDrizzleSchemas.generationState,
                  generationStateColumns: getTableColumns(
                    systemRepoDrizzleSchemas.generationState,
                  ),
                  drainBoundsTable: systemRepoDrizzleSchemas.drainBounds,
                  drainBoundsColumns: getTableColumns(
                    systemRepoDrizzleSchemas.drainBounds,
                  ),
                  replayCompletionsTable:
                    systemRepoDrizzleSchemas.replayCompletions,
                  replayCompletionsColumns: getTableColumns(
                    systemRepoDrizzleSchemas.replayCompletions,
                  ),
                  repoTable: systemRepoDrizzleSchemas.repos,
                };
                const origin = yield* allocateDeploy({
                  db,
                  workerVersionId: 'resume-linked-origin',
                  clean: false,
                  cleanRequestId: null,
                  systemSpec: historicalSystemSpec,
                  selectionTable: common.selectionTable,
                  selectionColumns: common.selectionColumns,
                  deployTable: common.deployTable,
                  deployColumns: common.deployColumns,
                });
                yield* activateDeploy({
                  ...common,
                  executingWorkerVersionId: 'resume-linked-origin',
                  deployId: origin.deployId,
                  drainSystemWrites: () => Effect.void,
                });
                const originDeploy = db
                  .select()
                  .from(systemRepoDrizzleSchemas.deploy)
                  .where(
                    eq(systemRepoDrizzleSchemas.deploy.id, origin.deployId),
                  )
                  .get();
                expect(originDeploy).toMatchObject({ status: 'succeeded' });

                const target = yield* allocateDeploy({
                  db,
                  workerVersionId: 'resume-linked-target',
                  clean: false,
                  cleanRequestId: null,
                  systemSpec: currentSystemSpec,
                  selectionTable: common.selectionTable,
                  selectionColumns: common.selectionColumns,
                  deployTable: common.deployTable,
                  deployColumns: common.deployColumns,
                });
                const interrupted = yield* activateDeploy({
                  ...common,
                  executingWorkerVersionId: 'resume-linked-target',
                  deployId: target.deployId,
                  drainSystemWrites: () =>
                    Effect.fail(
                      new ZerospinError({
                        code: 'test-source-write-drain-interrupted',
                        message: 'Interrupt after the linked ownership cut',
                      }),
                    ),
                }).pipe(Effect.either);
                expect(interrupted._tag).toBe('Left');
                expect(
                  db
                    .select()
                    .from(systemRepoDrizzleSchemas.deploy)
                    .where(
                      eq(systemRepoDrizzleSchemas.deploy.id, target.deployId),
                    )
                    .get(),
                ).toMatchObject({
                  status: 'activating',
                  activationCheckpoint: 'ownership-cut',
                });

                yield* activateDeploy({
                  ...common,
                  executingWorkerVersionId: 'resume-linked-target',
                  deployId: target.deployId,
                  drainSystemWrites: () => Effect.void,
                });
                const targetDeploy = db
                  .select()
                  .from(systemRepoDrizzleSchemas.deploy)
                  .where(
                    eq(systemRepoDrizzleSchemas.deploy.id, target.deployId),
                  )
                  .get();
                const targetGeneration = db
                  .select()
                  .from(systemRepoDrizzleSchemas.generationState)
                  .where(
                    eq(
                      systemRepoDrizzleSchemas.generationState.generationId,
                      targetDeploy?.generationId,
                    ),
                  )
                  .get();
                const sourceGeneration = db
                  .select()
                  .from(systemRepoDrizzleSchemas.generationState)
                  .where(
                    eq(
                      systemRepoDrizzleSchemas.generationState.generationId,
                      originDeploy?.generationId,
                    ),
                  )
                  .get();
                expect(targetDeploy).toMatchObject({ status: 'succeeded' });
                expect(targetGeneration).toMatchObject({ phase: 'open' });
                expect(sourceGeneration).toMatchObject({ phase: 'retired' });
              }),
            ),
          ),
        );
      }),
    ));
});
