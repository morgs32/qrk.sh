import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { env, runInDurableObject } from 'cloudflare:test';
import { getTableColumns } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { main, system } from './fixtures/system.js';
import { managedRuntime } from './managedRuntime.js';
import { activateDeploy } from './SystemRepo/activateDeploy/activateDeploy.js';
import { allocateDeploy } from './SystemRepo/allocateDeploy/allocateDeploy.js';
import { initializeSystemRepo } from './SystemRepo/initializeSystemRepo.js';
import { migrateSystemRepo } from './SystemRepo/migrateSystemRepo.js';
import {
  SystemRepo,
  systemRepoDbConfig,
  systemRepoDrizzleSchemas,
} from './SystemRepo/SystemRepo.js';
import { prepareGenerationStateFixture } from './workerd-utils/prepareGenerationStateFixture.js';

describe('SystemRepo deploy lifecycle', () => {
  it.effect(
    'runs initial, reuse, linked, and detached-clean sequences with atomic selection',
    () =>
      Effect.gen(function* () {
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });

        const initial = yield* prepareGenerationStateFixture({
          clean: false,
          workerVersionId: 'initial-sequence',
        });
        expect(initial.activationCheckpoint).toBe('final-replay-complete');

        const reused = yield* prepareGenerationStateFixture({
          clean: false,
          workerVersionId: 'reuse-sequence',
        });
        expect(reused.deployId).not.toBe(initial.deployId);
        expect(reused.generationId).toBe(initial.generationId);
        expect(reused.activationCheckpoint).toBe('generation-prepared');

        const systemSpec = makeSystemSpec({ system });
        const aggregateFrontendLock =
          systemSpec.aggregates[main.aggregateName]?.frontends[
            main.frontendName
          ]?.controller.aggregateFrontendLock;
        if (aggregateFrontendLock === undefined) {
          return yield* Effect.die(
            new Error('Fixture aggregate frontend lock is missing'),
          );
        }
        const retainedTicket = yield* makeAsync(() =>
          systemRepo.createAggregateFrontendWebSocketTicket({
            generationId: reused.generationId,
            repoName: 'frepo_retained_linked_read',
            aggregateId: makeAggregateId({ id: 'retained-linked-read' }),
            aggregateName: main.aggregateName,
            userId: 'usr_retained_linked_read',
            frontendName: main.frontendName,
            aggregateFrontendLock,
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const priorSystemSpec = structuredClone(systemSpec);
        priorSystemSpec.version = '0.9.0';
        Reflect.deleteProperty(priorSystemSpec.services, 'inventory');
        yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) => {
            const encodedPriorSystemSpec = JSON.stringify(priorSystemSpec);
            state.storage.sql.exec(
              'UPDATE deploy SET systemSpec = ? WHERE id = ?',
              encodedPriorSystemSpec,
              reused.deployId,
            );
            state.storage.sql.exec(
              'UPDATE generationState SET activeSystemSpec = ? WHERE generationId = ?',
              encodedPriorSystemSpec,
              reused.generationId,
            );
          }),
        );

        const linked = yield* prepareGenerationStateFixture({
          clean: false,
          workerVersionId: 'linked-sequence',
        });
        expect(linked.generationId).not.toBe(reused.generationId);
        expect(linked.activationCheckpoint).toBe('final-replay-complete');

        const retainedReadAdmission = yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId: reused.generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(retainedReadAdmission._tag).toBe('Left');
        if (retainedReadAdmission._tag === 'Left') {
          expect(retainedReadAdmission.left.code).toBe(
            'generation-read-admission-closed',
          );
          expect(retainedReadAdmission.left.extra).toMatchObject({
            generationId: reused.generationId,
            phase: 'retired',
          });
        }
        const retainedTicketTarget = yield* makeAsync(() =>
          systemRepo.consumeAggregateFrontendWebSocketTicket({
            ticket: retainedTicket,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(retainedTicketTarget._tag).toBe('Left');
        if (retainedTicketTarget._tag === 'Left') {
          expect(retainedTicketTarget.left.code).toBe(
            'generation-read-admission-closed',
          );
        }

        const clean = yield* prepareGenerationStateFixture({
          clean: true,
          workerVersionId: 'clean-sequence',
        });
        expect(clean.generationId).not.toBe(linked.generationId);
        expect(clean.activationCheckpoint).toBe('final-replay-complete');

        const snapshot = yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) => ({
            selection: state.storage.sql
              .exec<{
                activeDeployId: string | null;
                activatingDeployId: string | null;
              }>(
                "SELECT activeDeployId, activatingDeployId FROM selection WHERE id = 'sctl_system'",
              )
              .one(),
            generations: state.storage.sql
              .exec<{
                generationId: string;
                phase: string;
                prevGenerationId: string | null;
              }>(
                'SELECT generationId, phase, prevGenerationId FROM generationState ORDER BY createdAt',
              )
              .toArray(),
            systemRegistrations: state.storage.sql
              .exec<{ generationId: string; repoName: string }>(
                "SELECT generationId, repoName FROM repos WHERE repoType = 'SystemRepo' ORDER BY generationId",
              )
              .toArray(),
          })),
        );
        expect(snapshot.selection).toEqual({
          activeDeployId: clean.deployId,
          activatingDeployId: null,
        });
        expect(
          snapshot.generations.filter(row => row.phase === 'open'),
        ).toEqual([
          expect.objectContaining({
            generationId: clean.generationId,
            prevGenerationId: null,
          }),
        ]);
        expect(
          snapshot.generations
            .filter(row => row.generationId !== clean.generationId)
            .every(row => row.phase === 'retired'),
        ).toBe(true);
        expect(snapshot.systemRegistrations).toHaveLength(3);
        expect(
          snapshot.systemRegistrations.every(
            row => row.repoName === env.ZEROSPIN_SYSTEM_ID,
          ),
        ).toBe(true);
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('binds deploy identity to worker version and clean mode', () =>
    Effect.gen(function* () {
      const first = yield* prepareGenerationStateFixture({
        clean: false,
        workerVersionId: 'deploy-identity',
      });
      const idempotent = yield* prepareGenerationStateFixture({
        clean: false,
        workerVersionId: 'deploy-identity',
      });
      expect(idempotent.deployId).toBe(first.deployId);

      const distinct = yield* prepareGenerationStateFixture({
        clean: false,
        workerVersionId: 'deploy-identity-distinct',
      });
      expect(distinct.deployId).not.toBe(first.deployId);
      expect(distinct.workerVersionId).not.toBe(first.workerVersionId);
      expect(distinct.generationId).toBe(first.generationId);

      const distinctClean = yield* prepareGenerationStateFixture({
        clean: true,
        workerVersionId: 'deploy-identity',
      });
      expect(distinctClean.deployId).not.toBe(first.deployId);
      expect(distinctClean.workerVersionId).toBe(first.workerVersionId);
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'preserves Production clean-token selection with clean identity first',
    () =>
      Effect.gen(function* () {
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        const result = yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) =>
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
                const systemSpec = makeSystemSpec({ system });
                const encodedSystemSpec = yield* Schema.encode(
                  Schema.parseJson(SystemSpecSchema),
                )(systemSpec);
                state.storage.sql.exec(
                  `INSERT INTO selection
                     (id, activeDeployId, activatingDeployId,
                      writeGenerationId, lastWriteIndex, lastCleanRequestId)
                   VALUES ('sctl_system', NULL, NULL, NULL, 0, NULL)
                   ON CONFLICT(id) DO NOTHING`,
                );
                const originalSelection = state.storage.sql
                  .exec<{
                    activatingDeployId: string | null;
                    lastCleanRequestId: string | null;
                  }>(
                    `SELECT activatingDeployId, lastCleanRequestId
                       FROM selection
                      WHERE id = 'sctl_system'`,
                  )
                  .one();
                state.storage.sql.exec(
                  `UPDATE selection
                      SET activatingDeployId = NULL,
                          lastCleanRequestId = 'truth-table-consumed'
                    WHERE id = 'sctl_system'`,
                );
                const now = Date.now();
                state.storage.sql.exec(
                  `INSERT INTO deploy
                     (id, prevDeployId, generationId, workerVersionId,
                      systemSpec, clean, status, activationCheckpoint,
                      failure, startedAt, completedAt)
                   VALUES
                     ('dpl_truth_same_clean', NULL, 'gen_truth_same_clean',
                      'truth-table-same', ?, 1, 'succeeded',
                      'generation-prepared', NULL, ?, ?),
                     ('dpl_truth_consumed_false', NULL,
                      'gen_truth_consumed_false', 'truth-table-consumed-new',
                      ?, 0, 'succeeded', 'generation-prepared', NULL, ?, ?),
                     ('dpl_truth_both_false', NULL, 'gen_truth_both_false',
                      'truth-table-both', ?, 0, 'succeeded',
                      'generation-prepared', NULL, ?, ?),
                     ('dpl_truth_both_clean', NULL, 'gen_truth_both_clean',
                      'truth-table-both', ?, 1, 'succeeded',
                      'generation-prepared', NULL, ?, ?)`,
                  encodedSystemSpec,
                  now,
                  now,
                  encodedSystemSpec,
                  now,
                  now,
                  encodedSystemSpec,
                  now,
                  now,
                  encodedSystemSpec,
                  now,
                  now,
                );

                const sameVersionConsumed = yield* allocateDeploy({
                  db,
                  workerVersionId: 'truth-table-same',
                  clean: false,
                  cleanRequestId: 'truth-table-consumed',
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
                const newVersionConsumed = yield* allocateDeploy({
                  db,
                  workerVersionId: 'truth-table-consumed-new',
                  clean: false,
                  cleanRequestId: 'truth-table-consumed',
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
                const newVersionFresh = yield* allocateDeploy({
                  db,
                  workerVersionId: 'truth-table-fresh-new',
                  clean: false,
                  cleanRequestId: 'truth-table-fresh',
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
                const bothRows = yield* allocateDeploy({
                  db,
                  workerVersionId: 'truth-table-both',
                  clean: false,
                  cleanRequestId: 'truth-table-consumed',
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
                const freshRow = state.storage.sql
                  .exec<{ clean: number }>(
                    'SELECT clean FROM deploy WHERE id = ?',
                    newVersionFresh.deployId,
                  )
                  .one();

                state.storage.sql.exec(
                  `UPDATE selection
                      SET activatingDeployId = ?, lastCleanRequestId = ?
                    WHERE id = 'sctl_system'`,
                  originalSelection.activatingDeployId,
                  originalSelection.lastCleanRequestId,
                );
                state.storage.sql.exec(
                  `DELETE FROM deploy
                    WHERE workerVersionId IN
                      ('truth-table-same', 'truth-table-consumed-new',
                       'truth-table-fresh-new', 'truth-table-both')`,
                );
                return {
                  bothRows,
                  freshRow,
                  newVersionConsumed,
                  sameVersionConsumed,
                };
              }),
            ),
          ),
        );

        expect(result.sameVersionConsumed.deployId).toBe(
          'dpl_truth_same_clean',
        );
        expect(result.newVersionConsumed.deployId).toBe(
          'dpl_truth_consumed_false',
        );
        expect(result.freshRow.clean).toBe(1);
        expect(result.bothRows.deployId).toBe('dpl_truth_both_clean');
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'refuses cross-bundle resume without mutating the older candidate',
    () =>
      Effect.gen(function* () {
        const initial = yield* prepareGenerationStateFixture({
          clean: false,
          workerVersionId: 'cross-bundle-initial',
        });
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        const candidateId = 'dpl_cross_bundle_candidate';
        yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) => {
            const active = state.storage.sql
              .exec<{ systemSpec: string }>(
                'SELECT systemSpec FROM deploy WHERE id = ?',
                initial.deployId,
              )
              .one();
            state.storage.sql.exec(
              `INSERT INTO deploy
               (id, prevDeployId, generationId, workerVersionId, systemSpec,
                  clean, status, activationCheckpoint,
                  startedAt)
               VALUES (?, ?, ?, ?, ?, 0, 'activating', 'allocated', ?)`,
              candidateId,
              initial.deployId,
              initial.generationId,
              'older-bundle',
              active.systemSpec,
              Date.now(),
            );
            state.storage.sql.exec(
              "UPDATE selection SET activatingDeployId = ? WHERE id = 'sctl_system'",
              candidateId,
            );
          }),
        );

        const refusal = yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) =>
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
                return yield* activateDeploy({
                  db,
                  configuredSystemId: env.ZEROSPIN_SYSTEM_ID,
                  executingWorkerVersionId: env.WORKER_VERSION_METADATA.id,
                  deployId: candidateId,
                  cleanRequestId: null,
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
                  submitTargetedSeed: () =>
                    Effect.die(
                      new Error(
                        'Cross-bundle refusal must precede seed submission',
                      ),
                    ),
                  drainSystemWrites: () =>
                    Effect.die(
                      new Error(
                        'Cross-bundle refusal must precede write delivery',
                      ),
                    ),
                }).pipe(Effect.either);
              }),
            ),
          ),
        );
        expect(refusal._tag).toBe('Left');
        if (refusal._tag === 'Left') {
          expect(refusal.left.code).toBe(
            'system-deploy-worker-version-mismatch',
          );
        }

        const unchanged = yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) => ({
            candidate: state.storage.sql
              .exec<{ status: string; activationCheckpoint: string }>(
                'SELECT status, activationCheckpoint FROM deploy WHERE id = ?',
                candidateId,
              )
              .one(),
            selection: state.storage.sql
              .exec<{ activatingDeployId: string | null }>(
                "SELECT activatingDeployId FROM selection WHERE id = 'sctl_system'",
              )
              .one(),
          })),
        );
        expect(unchanged).toEqual({
          candidate: {
            status: 'activating',
            activationCheckpoint: 'allocated',
          },
          selection: { activatingDeployId: candidateId },
        });
        yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) => {
            state.storage.sql.exec(
              "UPDATE deploy SET status = 'failed', completedAt = ? WHERE id = ?",
              Date.now(),
              candidateId,
            );
            state.storage.sql.exec(
              "UPDATE selection SET activatingDeployId = NULL WHERE id = 'sctl_system' AND activatingDeployId = ?",
              candidateId,
            );
          }),
        );
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'cleans open and incompletely draining branches to a fixed point before promotion',
    () =>
      Effect.gen(function* () {
        const active = yield* prepareGenerationStateFixture({
          clean: true,
          workerVersionId: 'fixed-point-clean-active',
        });
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        const drainingDeployId = 'dpl_fixed_point_draining';
        const drainingGenerationId = 'gen_fixed_point_draining';
        yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) => {
            const activeDeploy = state.storage.sql
              .exec<{ systemSpec: string }>(
                'SELECT systemSpec FROM deploy WHERE id = ?',
                active.deployId,
              )
              .one();
            const now = Date.now();
            state.storage.sql.exec(
              `INSERT INTO deploy
               (id, prevDeployId, generationId, workerVersionId, systemSpec,
                  clean, status, activationCheckpoint,
                  failure, startedAt, completedAt)
               VALUES (?, ?, ?, ?, ?, 0, 'succeeded',
                       'generation-prepared', NULL, ?, ?)`,
              drainingDeployId,
              active.deployId,
              drainingGenerationId,
              env.WORKER_VERSION_METADATA.id,
              activeDeploy.systemSpec,
              now,
              now,
            );
            state.storage.sql.exec(
              `INSERT INTO generationState
                 (generationId, prevGenerationId, successorGenerationId,
                  initialDeployId, activeDeployId, preparingDeployId, phase,
                  lastWriteIndex, activeSystemSpec, preparingSystemSpec, failure,
                  createdAt, readyAt, openedAt, drainFrozenAt,
                  retirementCompletedAt, retiredAt)
               VALUES (?, ?, NULL, ?, ?, NULL, 'draining', 0, ?, NULL,
                       NULL, ?, ?, ?, NULL, NULL, NULL)`,
              drainingGenerationId,
              active.generationId,
              drainingDeployId,
              drainingDeployId,
              activeDeploy.systemSpec,
              now + 1,
              now + 1,
              now + 1,
            );
          }),
        );

        const clean = yield* prepareGenerationStateFixture({
          clean: true,
          workerVersionId: 'fixed-point-clean-candidate',
        });
        const snapshot = yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) =>
            state.storage.sql
              .exec<{
                generationId: string;
                phase: string;
                drainFrozenAt: number | null;
                retirementCompletedAt: number | null;
                retiredAt: number | null;
              }>(
                `SELECT generationId, phase, drainFrozenAt,
                        retirementCompletedAt, retiredAt
                   FROM generationState
                  WHERE generationId IN (?, ?, ?)
                  ORDER BY generationId`,
                active.generationId,
                drainingGenerationId,
                clean.generationId,
              )
              .toArray(),
          ),
        );
        expect(
          snapshot.filter(row => row.generationId !== clean.generationId),
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              generationId: drainingGenerationId,
              phase: 'retired',
              drainFrozenAt: expect.any(Number),
              retirementCompletedAt: expect.any(Number),
              retiredAt: expect.any(Number),
            }),
            expect.objectContaining({
              generationId: active.generationId,
              phase: 'retired',
              drainFrozenAt: expect.any(Number),
              retirementCompletedAt: expect.any(Number),
              retiredAt: expect.any(Number),
            }),
          ]),
        );
        expect(snapshot).toContainEqual(
          expect.objectContaining({
            generationId: clean.generationId,
            phase: 'open',
          }),
        );
      }).pipe(Effect.provide(AsyncLive)),
  );
});
