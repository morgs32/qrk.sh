/*
 * Persisted SystemRepo migration acceptance:
 *
 * 1. Recreate the complete pre-033/034 schema and stored SystemSpec bytes.
 * 2. Re-enter through the ordinary Durable Object constructor.
 * 3. Prove strict current reads after every required DDL and JSON rewrite.
 * 4. Recreate a partially completed migration and prove exact retry behavior.
 */

import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { abortAllDurableObjects, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { system } from '../fixtures/system.js';

import { SystemRepo } from './SystemRepo.js';

describe('SystemRepo persisted migrations', () => {
  it.effect(
    'migrates the complete raw legacy schema and both stored SystemSpec columns',
    () =>
      Effect.gen(function* () {
        const generationId = 'gen_system_repo_raw_migration';
        const initialDeployId = 'dpl_system_repo_raw_migration_initial';
        const preparingDeployId = 'dpl_system_repo_raw_migration_preparing';
        const systemRepoName = `sysrepo_${generationId}`;

        const activeLegacySpec = structuredClone(makeSystemSpec({ system }));
        const activeLegacyAccount = activeLegacySpec.accountControllers.user;
        if (activeLegacyAccount === undefined) {
          throw new Error('Expected the fixture user account controller');
        }
        const activeLegacyAccountContract =
          activeLegacyAccount.contracts.createUser;
        if (activeLegacyAccountContract === undefined) {
          throw new Error('Expected the fixture createUser account contract');
        }
        Reflect.deleteProperty(
          activeLegacyAccountContract,
          'historicalDefinitions',
        );
        const activeLegacyActor = activeLegacyAccount.actorControllers.main;
        if (activeLegacyActor === undefined) {
          throw new Error('Expected the fixture main account actor');
        }
        const activeLegacyFrontend = activeLegacyActor.frontends.main;
        if (activeLegacyFrontend === undefined) {
          throw new Error('Expected the fixture main account frontend');
        }
        const activeLegacyFrontendContract =
          activeLegacyFrontend.frontendController.contracts.createList;
        if (activeLegacyFrontendContract === undefined) {
          throw new Error('Expected the fixture createList frontend contract');
        }
        Reflect.deleteProperty(
          activeLegacyFrontendContract,
          'historicalDefinitions',
        );
        const activeLegacyService = activeLegacySpec.serviceControllers.app;
        if (activeLegacyService === undefined) {
          throw new Error('Expected the fixture app service controller');
        }
        const activeLegacyServiceContract =
          activeLegacyService.contracts.createProduct;
        if (activeLegacyServiceContract === undefined) {
          throw new Error(
            'Expected the fixture createProduct service contract',
          );
        }
        Reflect.deleteProperty(
          activeLegacyServiceContract,
          'historicalDefinitions',
        );
        Reflect.deleteProperty(activeLegacyService, 'actorControllers');

        const preparingLegacySpec = structuredClone(makeSystemSpec({ system }));
        const preparingLegacyAccount =
          preparingLegacySpec.accountControllers.user;
        if (preparingLegacyAccount === undefined) {
          throw new Error('Expected the fixture user account controller');
        }
        const preparingLegacyAccountContract =
          preparingLegacyAccount.contracts.createUser;
        if (preparingLegacyAccountContract === undefined) {
          throw new Error('Expected the fixture createUser account contract');
        }
        Reflect.deleteProperty(
          preparingLegacyAccountContract,
          'historicalDefinitions',
        );
        const preparingLegacyActor =
          preparingLegacyAccount.actorControllers.main;
        if (preparingLegacyActor === undefined) {
          throw new Error('Expected the fixture main account actor');
        }
        const preparingLegacyFrontend = preparingLegacyActor.frontends.main;
        if (preparingLegacyFrontend === undefined) {
          throw new Error('Expected the fixture main account frontend');
        }
        const preparingLegacyFrontendContract =
          preparingLegacyFrontend.frontendController.contracts.createList;
        if (preparingLegacyFrontendContract === undefined) {
          throw new Error('Expected the fixture createList frontend contract');
        }
        Reflect.deleteProperty(
          preparingLegacyFrontendContract,
          'historicalDefinitions',
        );
        const preparingLegacyService =
          preparingLegacySpec.serviceControllers.app;
        if (preparingLegacyService === undefined) {
          throw new Error('Expected the fixture app service controller');
        }
        const preparingLegacyServiceContract =
          preparingLegacyService.contracts.createProduct;
        if (preparingLegacyServiceContract === undefined) {
          throw new Error(
            'Expected the fixture createProduct service contract',
          );
        }
        Reflect.deleteProperty(
          preparingLegacyServiceContract,
          'historicalDefinitions',
        );
        Reflect.deleteProperty(preparingLegacyService, 'actorControllers');

        // Create the present-day tables once, then reconstruct the raw schema
        // that existed before the finite-drain and lineage columns landed.
        const initialState = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(initialState).toBeNull();

        yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(systemRepoName),
            (_instance, state) => {
              state.storage.sql.exec(
                'ALTER TABLE generationState DROP COLUMN drainFrozenAt',
              );
              state.storage.sql.exec(
                'ALTER TABLE generationState DROP COLUMN successorGenerationId',
              );

              state.storage.sql.exec(
                'ALTER TABLE drainBounds DROP COLUMN systemWorkerName',
              );
              state.storage.sql.exec(
                'ALTER TABLE drainBounds DROP COLUMN frontendBlockRepoName',
              );
              state.storage.sql.exec(
                'ALTER TABLE drainBounds DROP COLUMN terminalFrontendIndex',
              );
              state.storage.sql.exec(
                'ALTER TABLE drainBounds DROP COLUMN segmentKind',
              );
              state.storage.sql.exec(
                'ALTER TABLE drainBounds DROP COLUMN predecessorGenerationId',
              );
              state.storage.sql.exec(
                'ALTER TABLE drainBounds DROP COLUMN predecessorRepoName',
              );
              state.storage.sql.exec(
                'ALTER TABLE drainBounds DROP COLUMN predecessorTerminalFrontendIndex',
              );

              state.storage.sql.exec(
                'ALTER TABLE frontendWebSocketTickets DROP COLUMN frontendVersion',
              );
              state.storage.sql.exec(
                'ALTER TABLE serviceFrontendWebSocketTickets DROP COLUMN frontendVersion',
              );

              state.storage.sql.exec(
                `INSERT INTO generationState (
                  generationId,
                  prevGenerationId,
                  initialDeployId,
                  activeDeployId,
                  preparingDeployId,
                  readiness,
                  admission,
                  activeSystemSpec,
                  preparingSystemSpec,
                  failure,
                  createdAt,
                  readyAt,
                  openedAt,
                  drainedAt
                ) VALUES (?, NULL, ?, ?, ?, 'initializing', 'closed', ?, ?, NULL, 0, NULL, NULL, NULL)`,
                generationId,
                initialDeployId,
                initialDeployId,
                preparingDeployId,
                JSON.stringify(activeLegacySpec),
                JSON.stringify(preparingLegacySpec),
              );
              state.storage.sql.exec(
                `INSERT INTO drainBounds (
                  deployId,
                  repoType,
                  repoName,
                  terminalCursor,
                  terminalIndex,
                  capturedAt
                ) VALUES (?, 'AccountBlockRepo', ?, ?, ?, ?)`,
                initialDeployId,
                'abrepo_raw_migration',
                'acur_raw_migration_4',
                4,
                5,
              );
              state.storage.sql.exec(
                `INSERT INTO frontendWebSocketTickets (
                  ticketHash,
                  deployId,
                  repoName,
                  expiresAt
                ) VALUES (?, ?, ?, ?)`,
                'legacy-account-ticket-hash',
                initialDeployId,
                'frtbrepo_legacy_ticket',
                30,
              );
              state.storage.sql.exec(
                `INSERT INTO serviceFrontendWebSocketTickets (
                  ticketHash,
                  deployId,
                  serviceName,
                  actorName,
                  actorId,
                  frontendName,
                  expiresAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                'legacy-service-ticket-hash',
                initialDeployId,
                'app',
                'main',
                'actr_legacy_service_ticket',
                'main',
                30,
              );
              state.storage.kv.delete(
                'isMigratedServiceActorControllersSystemSpec',
              );
            },
          ),
        );

        // A cold constructor must finish every DDL change before the current
        // state descriptor decodes the two required SystemSpec columns.
        yield* Effect.promise(() => abortAllDurableObjects());
        const migratedState = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));

        expect(migratedState?.drainFrozenAt).toBeNull();
        expect(migratedState?.successorGenerationId).toBeNull();
        expect(
          migratedState?.activeSystemSpec?.serviceControllers.app
            ?.actorControllers,
        ).toEqual({});
        expect(
          migratedState?.preparingSystemSpec?.serviceControllers.app
            ?.actorControllers,
        ).toEqual({});
        expect(
          migratedState?.activeSystemSpec?.accountControllers.user?.contracts
            .createUser?.historicalDefinitions,
        ).toEqual([]);
        expect(
          migratedState?.activeSystemSpec?.accountControllers.user
            ?.actorControllers.main?.frontends.main?.frontendController
            .contracts.createList?.historicalDefinitions,
        ).toEqual([]);
        expect(
          migratedState?.activeSystemSpec?.serviceControllers.app?.contracts
            .createProduct?.historicalDefinitions,
        ).toEqual([]);
        expect(
          migratedState?.preparingSystemSpec?.accountControllers.user?.contracts
            .createUser?.historicalDefinitions,
        ).toEqual([]);
        expect(
          migratedState?.preparingSystemSpec?.accountControllers.user
            ?.actorControllers.main?.frontends.main?.frontendController
            .contracts.createList?.historicalDefinitions,
        ).toEqual([]);
        expect(
          migratedState?.preparingSystemSpec?.serviceControllers.app?.contracts
            .createProduct?.historicalDefinitions,
        ).toEqual([]);

        const migratedStorage = yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(systemRepoName),
            (_instance, state) => ({
              generationStateColumns: Array.from(
                state.storage.sql.exec<{ name: string }>(
                  'PRAGMA table_info(generationState)',
                ),
              ),
              drainBoundColumns: Array.from(
                state.storage.sql.exec<{ name: string }>(
                  'PRAGMA table_info(drainBounds)',
                ),
              ),
              frontendWebSocketTicketColumns: Array.from(
                state.storage.sql.exec<{ name: string; notnull: number }>(
                  'PRAGMA table_info(frontendWebSocketTickets)',
                ),
              ),
              serviceFrontendWebSocketTicketColumns: Array.from(
                state.storage.sql.exec<{ name: string; notnull: number }>(
                  'PRAGMA table_info(serviceFrontendWebSocketTickets)',
                ),
              ),
              frontendWebSocketTicketCount: state.storage.sql
                .exec<{ count: number }>(
                  'SELECT COUNT(*) AS count FROM frontendWebSocketTickets',
                )
                .one().count,
              serviceFrontendWebSocketTicketCount: state.storage.sql
                .exec<{ count: number }>(
                  'SELECT COUNT(*) AS count FROM serviceFrontendWebSocketTickets',
                )
                .one().count,
              drainBound: Array.from(
                state.storage.sql.exec<{
                  deployId: string;
                  repoType: string;
                  repoName: string;
                  terminalCursor: string | null;
                  terminalIndex: number | null;
                  systemWorkerName: string | null;
                  frontendBlockRepoName: string | null;
                  terminalFrontendIndex: number | null;
                  segmentKind: string | null;
                  predecessorGenerationId: string | null;
                  predecessorRepoName: string | null;
                  predecessorTerminalFrontendIndex: number | null;
                  capturedAt: number;
                }>(
                  `SELECT
                    deployId,
                    repoType,
                    repoName,
                    terminalCursor,
                    terminalIndex,
                    systemWorkerName,
                    frontendBlockRepoName,
                    terminalFrontendIndex,
                    segmentKind,
                    predecessorGenerationId,
                    predecessorRepoName,
                    predecessorTerminalFrontendIndex,
                    capturedAt
                  FROM drainBounds`,
                ),
              )[0],
              migrationReceipt: state.storage.kv.get(
                'isMigratedServiceActorControllersSystemSpec',
              ),
              repoExplorerReceipt: state.storage.kv.get(
                'isMigratedRepoExplorer',
              ),
            }),
          ),
        );

        expect(migratedStorage.generationStateColumns).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'drainFrozenAt' }),
            expect.objectContaining({ name: 'successorGenerationId' }),
          ]),
        );
        expect(migratedStorage.drainBoundColumns).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'systemWorkerName' }),
            expect.objectContaining({ name: 'frontendBlockRepoName' }),
            expect.objectContaining({ name: 'terminalFrontendIndex' }),
            expect.objectContaining({ name: 'segmentKind' }),
            expect.objectContaining({ name: 'predecessorGenerationId' }),
            expect.objectContaining({ name: 'predecessorRepoName' }),
            expect.objectContaining({
              name: 'predecessorTerminalFrontendIndex',
            }),
          ]),
        );
        expect(migratedStorage.frontendWebSocketTicketColumns).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'frontendVersion', notnull: 1 }),
          ]),
        );
        expect(migratedStorage.serviceFrontendWebSocketTicketColumns).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'frontendVersion', notnull: 1 }),
          ]),
        );
        expect(migratedStorage.frontendWebSocketTicketCount).toBe(0);
        expect(migratedStorage.serviceFrontendWebSocketTicketCount).toBe(0);
        expect(migratedStorage.drainBound).toEqual({
          deployId: initialDeployId,
          repoType: 'AccountBlockRepo',
          repoName: 'abrepo_raw_migration',
          terminalCursor: 'acur_raw_migration_4',
          terminalIndex: 4,
          systemWorkerName: null,
          frontendBlockRepoName: null,
          terminalFrontendIndex: null,
          segmentKind: null,
          predecessorGenerationId: null,
          predecessorRepoName: null,
          predecessorTerminalFrontendIndex: null,
          capturedAt: 5,
        });
        expect(migratedStorage.migrationReceipt).toBe('true');
        expect(migratedStorage.repoExplorerReceipt).toBe('true');
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'resumes a partially completed migration and is byte-idempotent after its receipt',
    () =>
      Effect.gen(function* () {
        const generationId = 'gen_system_repo_interrupted_migration';
        const initialDeployId = 'dpl_system_repo_interrupted_migration_initial';
        const preparingDeployId =
          'dpl_system_repo_interrupted_migration_preparing';
        const systemRepoName = `sysrepo_${generationId}`;
        const activeCurrentSpec = structuredClone(makeSystemSpec({ system }));
        const preparingLegacySpec = structuredClone(makeSystemSpec({ system }));
        const preparingLegacyService =
          preparingLegacySpec.serviceControllers.app;
        if (preparingLegacyService === undefined) {
          throw new Error('Expected the fixture app service controller');
        }
        const preparingLegacyServiceContract =
          preparingLegacyService.contracts.createProduct;
        if (preparingLegacyServiceContract === undefined) {
          throw new Error(
            'Expected the fixture createProduct service contract',
          );
        }
        Reflect.deleteProperty(
          preparingLegacyServiceContract,
          'historicalDefinitions',
        );
        Reflect.deleteProperty(preparingLegacyService, 'actorControllers');

        const initialState = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(initialState).toBeNull();

        // This is the durable state after only part of the DDL and JSON work:
        // some new columns exist, one SystemSpec is current, and the other is
        // still legacy. The one-time receipt was never committed.
        yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(systemRepoName),
            (_instance, state) => {
              state.storage.sql.exec(
                'ALTER TABLE generationState DROP COLUMN successorGenerationId',
              );
              state.storage.sql.exec(
                'ALTER TABLE drainBounds DROP COLUMN frontendBlockRepoName',
              );
              state.storage.sql.exec(
                'ALTER TABLE drainBounds DROP COLUMN segmentKind',
              );
              state.storage.sql.exec(
                'ALTER TABLE drainBounds DROP COLUMN predecessorRepoName',
              );
              state.storage.sql.exec(
                'ALTER TABLE frontendWebSocketTickets DROP COLUMN frontendVersion',
              );

              state.storage.sql.exec(
                `INSERT INTO generationState (
                  generationId,
                  prevGenerationId,
                  initialDeployId,
                  activeDeployId,
                  preparingDeployId,
                  readiness,
                  admission,
                  activeSystemSpec,
                  preparingSystemSpec,
                  failure,
                  createdAt,
                  readyAt,
                  openedAt,
                  drainFrozenAt,
                  drainedAt
                ) VALUES (?, NULL, ?, ?, ?, 'initializing', 'closed', ?, ?, NULL, 0, NULL, NULL, 12, NULL)`,
                generationId,
                initialDeployId,
                initialDeployId,
                preparingDeployId,
                JSON.stringify(activeCurrentSpec),
                JSON.stringify(preparingLegacySpec),
              );
              state.storage.sql.exec(
                `INSERT INTO drainBounds (
                  deployId,
                  repoType,
                  repoName,
                  terminalCursor,
                  terminalIndex,
                  systemWorkerName,
                  terminalFrontendIndex,
                  predecessorGenerationId,
                  predecessorTerminalFrontendIndex,
                  capturedAt
                ) VALUES (?, 'FrontendRepo', ?, ?, ?, ?, ?, ?, ?, ?)`,
                initialDeployId,
                'frepo_interrupted_migration',
                'acur_interrupted_migration_8',
                8,
                'system-worker-interrupted-migration',
                9,
                'gen_interrupted_migration_predecessor',
                7,
                10,
              );
              state.storage.sql.exec(
                `INSERT INTO frontendWebSocketTickets (
                  ticketHash,
                  deployId,
                  repoName,
                  expiresAt
                ) VALUES (?, ?, ?, ?)`,
                'interrupted-account-ticket-hash',
                initialDeployId,
                'frtbrepo_interrupted_ticket',
                30,
              );
              state.storage.kv.delete(
                'isMigratedServiceActorControllersSystemSpec',
              );
            },
          ),
        );

        yield* Effect.promise(() => abortAllDurableObjects());
        const firstMigratedState = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(firstMigratedState?.drainFrozenAt).toEqual(new Date(12_000));
        expect(firstMigratedState?.successorGenerationId).toBeNull();
        expect(firstMigratedState?.activeSystemSpec).toEqual(activeCurrentSpec);
        expect(
          firstMigratedState?.preparingSystemSpec?.serviceControllers.app
            ?.actorControllers,
        ).toEqual({});
        expect(
          firstMigratedState?.preparingSystemSpec?.serviceControllers.app
            ?.contracts.createProduct?.historicalDefinitions,
        ).toEqual([]);

        const firstPersistedState = yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(systemRepoName),
            (_instance, state) => ({
              generationState: Array.from(
                state.storage.sql.exec<{
                  activeSystemSpec: string;
                  preparingSystemSpec: string;
                }>(
                  'SELECT activeSystemSpec, preparingSystemSpec FROM generationState',
                ),
              )[0],
              drainBound: Array.from(
                state.storage.sql.exec<{
                  deployId: string;
                  repoName: string;
                  systemWorkerName: string | null;
                  frontendBlockRepoName: string | null;
                  terminalFrontendIndex: number | null;
                  segmentKind: string | null;
                  predecessorGenerationId: string | null;
                  predecessorRepoName: string | null;
                  predecessorTerminalFrontendIndex: number | null;
                }>(
                  `SELECT
                    deployId,
                    repoName,
                    systemWorkerName,
                    frontendBlockRepoName,
                    terminalFrontendIndex,
                    segmentKind,
                    predecessorGenerationId,
                    predecessorRepoName,
                    predecessorTerminalFrontendIndex
                  FROM drainBounds`,
                ),
              )[0],
              rowCount: Array.from(
                state.storage.sql.exec<{ count: number }>(
                  'SELECT COUNT(*) AS count FROM generationState',
                ),
              )[0]?.count,
              frontendWebSocketTicketColumns: Array.from(
                state.storage.sql.exec<{ name: string; notnull: number }>(
                  'PRAGMA table_info(frontendWebSocketTickets)',
                ),
              ),
              frontendWebSocketTicketCount: state.storage.sql
                .exec<{ count: number }>(
                  'SELECT COUNT(*) AS count FROM frontendWebSocketTickets',
                )
                .one().count,
              migrationReceipt: state.storage.kv.get(
                'isMigratedServiceActorControllersSystemSpec',
              ),
            }),
          ),
        );

        // A second cold constructor sees the durable receipt. It still checks
        // all DDL, but it neither rewrites bytes nor duplicates persisted rows.
        yield* Effect.promise(() => abortAllDurableObjects());
        const secondMigratedState = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        const secondPersistedState = yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(systemRepoName),
            (_instance, state) => ({
              generationState: Array.from(
                state.storage.sql.exec<{
                  activeSystemSpec: string;
                  preparingSystemSpec: string;
                }>(
                  'SELECT activeSystemSpec, preparingSystemSpec FROM generationState',
                ),
              )[0],
              drainBound: Array.from(
                state.storage.sql.exec<{
                  deployId: string;
                  repoName: string;
                  systemWorkerName: string | null;
                  frontendBlockRepoName: string | null;
                  terminalFrontendIndex: number | null;
                  segmentKind: string | null;
                  predecessorGenerationId: string | null;
                  predecessorRepoName: string | null;
                  predecessorTerminalFrontendIndex: number | null;
                }>(
                  `SELECT
                    deployId,
                    repoName,
                    systemWorkerName,
                    frontendBlockRepoName,
                    terminalFrontendIndex,
                    segmentKind,
                    predecessorGenerationId,
                    predecessorRepoName,
                    predecessorTerminalFrontendIndex
                  FROM drainBounds`,
                ),
              )[0],
              rowCount: Array.from(
                state.storage.sql.exec<{ count: number }>(
                  'SELECT COUNT(*) AS count FROM generationState',
                ),
              )[0]?.count,
              frontendWebSocketTicketColumns: Array.from(
                state.storage.sql.exec<{ name: string; notnull: number }>(
                  'PRAGMA table_info(frontendWebSocketTickets)',
                ),
              ),
              frontendWebSocketTicketCount: state.storage.sql
                .exec<{ count: number }>(
                  'SELECT COUNT(*) AS count FROM frontendWebSocketTickets',
                )
                .one().count,
              migrationReceipt: state.storage.kv.get(
                'isMigratedServiceActorControllersSystemSpec',
              ),
            }),
          ),
        );

        expect(secondMigratedState).toEqual(firstMigratedState);
        expect(secondPersistedState).toEqual(firstPersistedState);
        expect(secondPersistedState.rowCount).toBe(1);
        expect(secondPersistedState.frontendWebSocketTicketColumns).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'frontendVersion', notnull: 1 }),
          ]),
        );
        expect(secondPersistedState.frontendWebSocketTicketCount).toBe(0);
        expect(secondPersistedState.migrationReceipt).toBe('true');
        expect(secondPersistedState.drainBound).toEqual({
          deployId: initialDeployId,
          repoName: 'frepo_interrupted_migration',
          systemWorkerName: 'system-worker-interrupted-migration',
          frontendBlockRepoName: null,
          terminalFrontendIndex: 9,
          segmentKind: null,
          predecessorGenerationId: 'gen_interrupted_migration_predecessor',
          predecessorRepoName: null,
          predecessorTerminalFrontendIndex: 7,
        });
      }).pipe(Effect.provide(AsyncLive)),
  );
});
