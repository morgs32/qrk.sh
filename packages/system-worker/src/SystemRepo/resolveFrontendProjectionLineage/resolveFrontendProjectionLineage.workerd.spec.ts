/*
 * SystemRepo lineage classification acceptance coverage:
 *
 * 1. A detached open generation starts account and service frontends at root.
 * 2. Frozen real account and service segments become immutable ancestors.
 * 3. A later open generation skips an empty physical generation and inherits
 *    the nearest real archive.
 * 4. A projection first requested after freeze is snapshot-only and inherits
 *    that same archive without creating a local segment.
 * 5. A frozen real current segment keeps its persisted classification on retry.
 * 6. A drain gate that lands during ancestor lookup keeps the projection live
 *    until the actual freeze marker is durable.
 */

import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAccountId } from '@zerospin/core/utils/makeAccountId';
import { env, runInDurableObject } from 'cloudflare:test';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { FrontendBlockRepo } from '../../FrontendBlockRepo/FrontendBlockRepo.js';
import { FrontendRepo } from '../../FrontendRepo/FrontendRepo.js';
import { ServiceFrontendBlockRepo } from '../../ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.js';
import { ServiceFrontendRepo } from '../../ServiceFrontendRepo/ServiceFrontendRepo.js';
import { SystemRepo } from '../SystemRepo.js';

describe('SystemRepo.resolveFrontendProjectionLineage', () => {
  it.effect(
    'classifies account and service roots, inherited segments, frozen no-local segments, skipped generations, and persisted retries',
    () =>
      Effect.gen(function* () {
        const accountId = makeAccountId({ id: 'lineage-resolver' });
        const actorId = Schema.decodeUnknownSync(
          makeAbbreviationIdSchema(coreAbbreviations.actor),
        )('actr_lineage_resolver');
        const accountName = 'user';
        const accountActorName = 'main';
        const accountFrontendName = 'main';
        const serviceName = 'app';
        const serviceActorName = 'catalogViewer';
        const serviceFrontendName = 'catalog';

        const ancestorGenerationId = 'gen_lineage_resolver_ancestor';
        const ancestorDeployId = 'dpl_lineage_resolver_ancestor';
        const skippedGenerationId = 'gen_lineage_resolver_skipped';
        const skippedDeployId = 'dpl_lineage_resolver_skipped';
        const liveGenerationId = 'gen_lineage_resolver_live';
        const liveDeployId = 'dpl_lineage_resolver_live';
        const frozenGenerationId = 'gen_lineage_resolver_frozen';
        const frozenDeployId = 'dpl_lineage_resolver_frozen';
        const persistedGenerationId = 'gen_lineage_resolver_persisted';
        const persistedDeployId = 'dpl_lineage_resolver_persisted';

        const ancestorAccountRepoName =
          yield* FrontendRepo.repoUtils.nameUtils.makeName({
            generationId: ancestorGenerationId,
            accountId,
            accountName,
            actorId,
            actorName: accountActorName,
            frontendName: accountFrontendName,
          });
        const ancestorAccountBlockRepoName =
          yield* FrontendBlockRepo.repoUtils.nameUtils.makeName({
            generationId: ancestorGenerationId,
            accountId,
            accountName,
            actorId,
            actorName: accountActorName,
            frontendName: accountFrontendName,
          });
        const ancestorServiceRepoName =
          yield* ServiceFrontendRepo.repoUtils.nameUtils.makeName({
            generationId: ancestorGenerationId,
            serviceName,
            actorName: serviceActorName,
            actorId,
            frontendName: serviceFrontendName,
          });
        const ancestorServiceBlockRepoName =
          yield* ServiceFrontendBlockRepo.repoUtils.nameUtils.makeName({
            generationId: ancestorGenerationId,
            serviceName,
            actorName: serviceActorName,
            actorId,
            frontendName: serviceFrontendName,
          });

        // 1. Materialize the ancestor SystemRepo schema, then install one
        // ordinary detached open lifecycle row through raw persisted state.
        const emptyAncestorState = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: ancestorGenerationId,
          }).getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(emptyAncestorState).toBeNull();
        yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(`sysrepo_${ancestorGenerationId}`),
            (_instance, state) => {
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
                ) VALUES (?, NULL, ?, ?, NULL, 'ready', 'open', NULL, NULL, NULL, 0, 0, 0, NULL, NULL)`,
                ancestorGenerationId,
                ancestorDeployId,
                ancestorDeployId,
              );
            },
          ),
        );

        const ancestorSystemRepo = SystemRepo.getRepo({
          generationId: ancestorGenerationId,
        });
        const accountRoot = yield* makeAsync(() =>
          ancestorSystemRepo.resolveFrontendProjectionLineage({
            deployId: ancestorDeployId,
            target: {
              kind: 'account',
              accountId,
              accountName,
              actorId,
              actorName: accountActorName,
              frontendName: accountFrontendName,
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(accountRoot).toEqual({ mode: 'live', predecessor: null });

        const serviceRoot = yield* makeAsync(() =>
          ancestorSystemRepo.resolveFrontendProjectionLineage({
            deployId: ancestorDeployId,
            target: {
              kind: 'service',
              serviceName,
              actorName: serviceActorName,
              actorId,
              frontendName: serviceFrontendName,
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(serviceRoot).toEqual({ mode: 'live', predecessor: null });

        const rootReservations = yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(`sysrepo_${ancestorGenerationId}`),
            (_instance, state) =>
              state.storage.sql
                .exec<{
                  repoType: string;
                  repoName: string;
                  systemWorkerName: string | null;
                  frontendBlockRepoName: string | null;
                  terminalFrontendIndex: number | null;
                  segmentKind: string;
                }>(
                  'SELECT repoType, repoName, systemWorkerName, frontendBlockRepoName, terminalFrontendIndex, segmentKind FROM drainBounds ORDER BY repoType',
                )
                .toArray(),
          ),
        );
        expect(rootReservations).toEqual([
          {
            repoType: 'FrontendRepo',
            repoName: ancestorAccountRepoName,
            systemWorkerName: null,
            frontendBlockRepoName: null,
            terminalFrontendIndex: null,
            segmentKind: 'root',
          },
          {
            repoType: 'ServiceFrontendRepo',
            repoName: ancestorServiceRepoName,
            systemWorkerName: null,
            frontendBlockRepoName: null,
            terminalFrontendIndex: null,
            segmentKind: 'root',
          },
        ]);

        // 2. Freeze the ancestor and persist one real root segment for each
        // frontend kind by completing the reservations. These are the only
        // physical archives in the chain.
        yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(`sysrepo_${ancestorGenerationId}`),
            (_instance, state) => {
              state.storage.sql.exec(
                "UPDATE generationState SET admission = 'drained', drainFrozenAt = 1, drainedAt = 1 WHERE generationId = ?",
                ancestorGenerationId,
              );
              state.storage.sql.exec(
                `UPDATE drainBounds
                 SET systemWorkerName = 'ancestor-worker',
                     frontendBlockRepoName = ?,
                     terminalFrontendIndex = 4,
                     capturedAt = 1
                 WHERE deployId = ? AND repoName = ?`,
                ancestorAccountBlockRepoName,
                ancestorDeployId,
                ancestorAccountRepoName,
              );
              state.storage.sql.exec(
                `UPDATE drainBounds
                 SET systemWorkerName = 'ancestor-worker',
                     frontendBlockRepoName = ?,
                     terminalFrontendIndex = 7,
                     capturedAt = 1
                 WHERE deployId = ? AND repoName = ?`,
                ancestorServiceBlockRepoName,
                ancestorDeployId,
                ancestorServiceRepoName,
              );
            },
          ),
        );

        // 3. The direct predecessor has no local projection rows at all.
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: skippedGenerationId,
          }).getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(`sysrepo_${skippedGenerationId}`),
            (_instance, state) => {
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
                ) VALUES (?, ?, ?, ?, NULL, 'ready', 'drained', NULL, NULL, NULL, 1, 1, 1, 1, 1)`,
                skippedGenerationId,
                ancestorGenerationId,
                skippedDeployId,
                skippedDeployId,
              );
            },
          ),
        );

        // 4. An open descendant bypasses the empty generation and creates a
        // real inherited segment from the nearest archived account/service row.
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: liveGenerationId,
          }).getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(`sysrepo_${liveGenerationId}`),
            (_instance, state) => {
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
                ) VALUES (?, ?, ?, ?, NULL, 'ready', 'open', NULL, NULL, NULL, 2, 2, 2, NULL, NULL)`,
                liveGenerationId,
                skippedGenerationId,
                liveDeployId,
                liveDeployId,
              );
            },
          ),
        );

        const liveSystemRepo = SystemRepo.getRepo({
          generationId: liveGenerationId,
        });
        const accountInherited = yield* makeAsync(() =>
          liveSystemRepo.resolveFrontendProjectionLineage({
            deployId: liveDeployId,
            target: {
              kind: 'account',
              accountId,
              accountName,
              actorId,
              actorName: accountActorName,
              frontendName: accountFrontendName,
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(accountInherited).toEqual({
          mode: 'live',
          predecessor: {
            generationId: ancestorGenerationId,
            repoName: ancestorAccountBlockRepoName,
            terminalFrontendIndex: 4,
          },
        });

        const serviceInherited = yield* makeAsync(() =>
          liveSystemRepo.resolveFrontendProjectionLineage({
            deployId: liveDeployId,
            target: {
              kind: 'service',
              serviceName,
              actorName: serviceActorName,
              actorId,
              frontendName: serviceFrontendName,
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(serviceInherited).toEqual({
          mode: 'live',
          predecessor: {
            generationId: ancestorGenerationId,
            repoName: ancestorServiceBlockRepoName,
            terminalFrontendIndex: 7,
          },
        });

        // 5. The same missing targets first requested after freeze retain the
        // ancestor index but are explicitly snapshot-only.
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: frozenGenerationId,
          }).getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(`sysrepo_${frozenGenerationId}`),
            (_instance, state) => {
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
                ) VALUES (?, ?, ?, ?, NULL, 'ready', 'draining', NULL, NULL, NULL, 3, 3, 3, 3, NULL)`,
                frozenGenerationId,
                skippedGenerationId,
                frozenDeployId,
                frozenDeployId,
              );
            },
          ),
        );

        const frozenSystemRepo = SystemRepo.getRepo({
          generationId: frozenGenerationId,
        });
        const accountNoLocal = yield* makeAsync(() =>
          frozenSystemRepo.resolveFrontendProjectionLineage({
            deployId: frozenDeployId,
            target: {
              kind: 'account',
              accountId,
              accountName,
              actorId,
              actorName: accountActorName,
              frontendName: accountFrontendName,
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(accountNoLocal).toEqual({
          mode: 'no-local-segment',
          predecessor: accountInherited.predecessor,
        });

        const serviceNoLocal = yield* makeAsync(() =>
          frozenSystemRepo.resolveFrontendProjectionLineage({
            deployId: frozenDeployId,
            target: {
              kind: 'service',
              serviceName,
              actorName: serviceActorName,
              actorId,
              frontendName: serviceFrontendName,
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(serviceNoLocal).toEqual({
          mode: 'no-local-segment',
          predecessor: serviceInherited.predecessor,
        });

        // 6. A frozen current real segment wins over freeze-time
        // reclassification, and its exact persisted predecessor is returned.
        const persistedAccountRepoName =
          yield* FrontendRepo.repoUtils.nameUtils.makeName({
            generationId: persistedGenerationId,
            accountId,
            accountName,
            actorId,
            actorName: accountActorName,
            frontendName: accountFrontendName,
          });
        const persistedAccountBlockRepoName =
          yield* FrontendBlockRepo.repoUtils.nameUtils.makeName({
            generationId: persistedGenerationId,
            accountId,
            accountName,
            actorId,
            actorName: accountActorName,
            frontendName: accountFrontendName,
          });
        const persistedServiceRepoName =
          yield* ServiceFrontendRepo.repoUtils.nameUtils.makeName({
            generationId: persistedGenerationId,
            serviceName,
            actorName: serviceActorName,
            actorId,
            frontendName: serviceFrontendName,
          });
        const persistedServiceBlockRepoName =
          yield* ServiceFrontendBlockRepo.repoUtils.nameUtils.makeName({
            generationId: persistedGenerationId,
            serviceName,
            actorName: serviceActorName,
            actorId,
            frontendName: serviceFrontendName,
          });
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: persistedGenerationId,
          }).getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(`sysrepo_${persistedGenerationId}`),
            (_instance, state) => {
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
                ) VALUES (?, ?, ?, ?, NULL, 'ready', 'draining', NULL, NULL, NULL, 4, 4, 4, 4, NULL)`,
                persistedGenerationId,
                skippedGenerationId,
                persistedDeployId,
                persistedDeployId,
              );
              state.storage.sql.exec(
                `INSERT INTO drainBounds (
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
                ) VALUES (?, 'FrontendRepo', ?, NULL, NULL, 'persisted-worker', ?, 5, 'inherited', ?, ?, 4, 4)`,
                persistedDeployId,
                persistedAccountRepoName,
                persistedAccountBlockRepoName,
                ancestorGenerationId,
                ancestorAccountBlockRepoName,
              );
              state.storage.sql.exec(
                `INSERT INTO drainBounds (
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
                ) VALUES (?, 'ServiceFrontendRepo', ?, NULL, NULL, 'persisted-worker', ?, 8, 'inherited', ?, ?, 7, 4)`,
                persistedDeployId,
                persistedServiceRepoName,
                persistedServiceBlockRepoName,
                ancestorGenerationId,
                ancestorServiceBlockRepoName,
              );
            },
          ),
        );

        const persistedSystemRepo = SystemRepo.getRepo({
          generationId: persistedGenerationId,
        });
        const persistedAccount = yield* makeAsync(() =>
          persistedSystemRepo.resolveFrontendProjectionLineage({
            deployId: persistedDeployId,
            target: {
              kind: 'account',
              accountId,
              accountName,
              actorId,
              actorName: accountActorName,
              frontendName: accountFrontendName,
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(persistedAccount).toEqual({
          mode: 'live',
          predecessor: accountInherited.predecessor,
        });

        const persistedService = yield* makeAsync(() =>
          persistedSystemRepo.resolveFrontendProjectionLineage({
            deployId: persistedDeployId,
            target: {
              kind: 'service',
              serviceName,
              actorName: serviceActorName,
              actorId,
              frontendName: serviceFrontendName,
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(persistedService).toEqual({
          mode: 'live',
          predecessor: serviceInherited.predecessor,
        });
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'rechecks freeze state after an ancestor await before classifying a projection',
    () =>
      Effect.gen(function* () {
        const actorId = Schema.decodeUnknownSync(
          makeAbbreviationIdSchema(coreAbbreviations.actor),
        )('actr_lineage_interleaving');
        const ancestorGenerationId = 'gen_lineage_interleaving_ancestor';
        const ancestorDeployId = 'dpl_lineage_interleaving_ancestor';
        const currentGenerationId = 'gen_lineage_interleaving_current';
        const currentDeployId = 'dpl_lineage_interleaving_current';

        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: ancestorGenerationId,
          }).getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: currentGenerationId,
          }).getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(`sysrepo_${ancestorGenerationId}`),
            (_instance, state) => {
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
                ) VALUES (?, NULL, ?, ?, NULL, 'ready', 'drained', NULL, NULL, NULL, 0, 0, 0, 1, 1)`,
                ancestorGenerationId,
                ancestorDeployId,
                ancestorDeployId,
              );
            },
          ),
        );
        yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(`sysrepo_${currentGenerationId}`),
            (_instance, state) => {
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
                ) VALUES (?, ?, ?, ?, NULL, 'ready', 'open', NULL, NULL, NULL, 0, 0, 0, NULL, NULL)`,
                currentGenerationId,
                ancestorGenerationId,
                currentDeployId,
                currentDeployId,
              );
            },
          ),
        );

        let markAncestorHeld: (() => void) | undefined;
        const ancestorHeld = new Promise<void>(resolve => {
          markAncestorHeld = resolve;
        });
        let releaseAncestor: (() => void) | undefined;
        const ancestorRelease = new Promise<void>(resolve => {
          releaseAncestor = resolve;
        });
        const heldAncestor = runInDurableObject(
          env.SYSTEM_REPO.getByName(`sysrepo_${ancestorGenerationId}`),
          async (_instance, state) =>
            await state.blockConcurrencyWhile(async () => {
              markAncestorHeld?.();
              await ancestorRelease;
            }),
        );
        yield* Effect.promise(() => ancestorHeld);

        const resolving = SystemRepo.getRepo({
          generationId: currentGenerationId,
        }).resolveFrontendProjectionLineage({
          deployId: currentDeployId,
          target: {
            kind: 'service',
            serviceName: 'app',
            actorName: 'interleavingActor',
            actorId,
            frontendName: 'interleavingFrontend',
          },
        });

        // This later request to the same current SystemRepo completes while
        // the resolver is blocked on its ancestor, proving the first request
        // has crossed the initial open-state read and yielded at that RPC.
        const stateDuringAncestorWait = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: currentGenerationId,
          }).getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(stateDuringAncestorWait).toMatchObject({
          admission: 'open',
          drainFrozenAt: null,
        });

        yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(`sysrepo_${currentGenerationId}`),
            (_instance, state) => {
              state.storage.sql.exec(
                "UPDATE generationState SET admission = 'draining' WHERE generationId = ?",
                currentGenerationId,
              );
            },
          ),
        );
        releaseAncestor?.();
        yield* Effect.promise(() => heldAncestor);

        const resolvedAfterGate = yield* makeAsync(() => resolving).pipe(
          Effect.flatMap(decodeRpc),
        );
        expect(resolvedAfterGate).toEqual({
          mode: 'live',
          predecessor: null,
        });
        const reservationCount = yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(`sysrepo_${currentGenerationId}`),
            (_instance, state) =>
              state.storage.sql
                .exec<{ count: number }>(
                  'SELECT COUNT(*) AS count FROM drainBounds',
                )
                .one().count,
          ),
        );
        expect(reservationCount).toBe(1);
      }).pipe(Effect.provide(AsyncLive)),
  );
});
