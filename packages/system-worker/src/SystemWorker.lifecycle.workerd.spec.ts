/*
 * System-worker lifecycle integration coverage:
 *
 * 1. Prepare and open one detached root generation.
 * 2. Reuse that ready generation for a compatible successor deploy.
 * 3. Freeze then complete the active successor and prove fresh account/service
 *    tickets remain readable until the second phase closes read admission.
 * 4. Reject open and drain requests that have no prepared generation state.
 */

import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAccountId } from '@zerospin/core/utils/makeAccountId';
import { prefixActorId } from '@zerospin/core/utils/prefixActorId';
import {
  makeTelemetryCollector,
  makeTraceableRpcTarget,
  TelemetryCollector,
} from '@zerospin/logger';
import { env, runInDurableObject } from 'cloudflare:test';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { ActorBlockRepo } from './ActorBlockRepo/ActorBlockRepo.js';
import { drainFrontendSubscribers } from './ActorBlockRepo/drainFrontendSubscribers/drainFrontendSubscribers.js';
import { getActorBlockRepo } from './ActorBlockRepo/getActorBlockRepo/getActorBlockRepo.js';
import { ActorRepo } from './ActorRepo/ActorRepo.js';
import { getActorRepo } from './ActorRepo/getActorRepo/getActorRepo.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { main, system } from './fixtures/system.js';
import { FrontendBlockRepo } from './FrontendBlockRepo/FrontendBlockRepo.js';
import { FrontendRepo } from './FrontendRepo/FrontendRepo.js';
import { getFrontendRepo } from './FrontendRepo/getFrontendRepo/getFrontendRepo.js';
import { managedRuntime } from './managedRuntime.js';
import { openGeneration } from './openGeneration/openGeneration.js';
import { prepareGeneration } from './prepareGeneration/prepareGeneration.js';
import { SystemRepo } from './SystemRepo/SystemRepo.js';
import { systemWorkerAbbreviations } from './systemWorkerAbbreviations.js';
import { executeInRepo } from './workerd-utils/executeInRepo.js';

describe('SystemWorker generation lifecycle', () => {
  it.effect(
    'prepares, opens, reuses, and drains one generation with exact deploy admission',
    () =>
      Effect.gen(function* () {
        const generationId = 'gen_system_worker_lifecycle';
        const initialDeployId = 'dpl_system_worker_initial';
        const reuseDeployId = 'dpl_system_worker_reuse';
        const successorGenerationId = 'gen_system_worker_lifecycle_successor';
        const systemSpec = makeSystemSpec({ system });

        expect(env.ZEROSPIN_SELF_HOSTED).toBe('true');

        // 1. A detached root has no predecessor and no migration seeds here.
        //    Preparation owns its closed state until every root postcondition
        //    succeeds and readiness becomes authoritative.
        const preparedRoot = yield* prepareGeneration({
          deployId: initialDeployId,
          generationId,
          prevGenerationId: null,
          systemSpec,
          seeds: [],
        });
        expect(preparedRoot).toEqual({
          deployId: initialDeployId,
          generationId,
          readiness: 'ready',
          reusedGeneration: false,
        });

        // 2. Opening promotes the prepared deploy into generation-local
        //    admission and returns the concrete Worker's Version Metadata id.
        const openedRoot = yield* openGeneration({
          deployId: initialDeployId,
          generationId,
        });
        expect(openedRoot).toEqual({
          deployId: initialDeployId,
          generationId,
          workerVersionId: expect.any(String),
        });
        expect(openedRoot.workerVersionId.length).toBeGreaterThan(0);

        const rootState = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(rootState).toMatchObject({
          generationId,
          prevGenerationId: null,
          initialDeployId,
          activeDeployId: initialDeployId,
          preparingDeployId: null,
          readiness: 'ready',
          admission: 'open',
          successorGenerationId: null,
        });

        const initialDeployTicket = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).createFrontendWebSocketTicket({
            deployId: initialDeployId,
            repoName: 'frtbrepo_initial_target',
            frontendVersion: '1.0.0',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(initialDeployTicket).toMatch(
          /^gen_system_worker_lifecycle\.[A-Za-z0-9_-]{43}$/,
        );
        const storedInitialDeployTicket = yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(
              `${systemWorkerAbbreviations.systemRepo}_${generationId}`,
            ),
            (_instance, state) =>
              state.storage.sql
                .exec<{
                  ticketHash: string;
                  deployId: string;
                  repoName: string;
                  frontendVersion: string;
                  expiresAt: number;
                }>(
                  'SELECT ticketHash, deployId, repoName, frontendVersion, expiresAt FROM frontendWebSocketTickets WHERE repoName = ?',
                  'frtbrepo_initial_target',
                )
                .one(),
          ),
        );
        expect(storedInitialDeployTicket.ticketHash).toMatch(
          /^[A-Za-z0-9_-]{43}$/,
        );
        expect(storedInitialDeployTicket.ticketHash).not.toBe(
          initialDeployTicket,
        );
        expect(Object.hasOwn(storedInitialDeployTicket, 'ticket')).toBe(false);
        expect(storedInitialDeployTicket).toMatchObject({
          deployId: initialDeployId,
          repoName: 'frtbrepo_initial_target',
          frontendVersion: '1.0.0',
        });

        // 3. Identical encoded model definitions select the existing lineage.
        //    The second deploy prepares against the same generation rather than
        //    allocating or replaying a successor generation.
        const preparedReuse = yield* prepareGeneration({
          deployId: reuseDeployId,
          generationId,
          prevGenerationId: null,
          systemSpec,
          seeds: [],
        });
        expect(preparedReuse).toEqual({
          deployId: reuseDeployId,
          generationId,
          readiness: 'ready',
          reusedGeneration: true,
        });

        const wrongOwnerOpen = yield* openGeneration({
          deployId: initialDeployId,
          generationId,
        }).pipe(Effect.either);
        expect(wrongOwnerOpen._tag).toBe('Left');
        if (wrongOwnerOpen._tag === 'Left') {
          expect(wrongOwnerOpen.left.code).toBe(
            'generation-open-deploy-mismatch',
          );
        }

        const openedReuse = yield* openGeneration({
          deployId: reuseDeployId,
          generationId,
        });
        expect(openedReuse).toEqual({
          deployId: reuseDeployId,
          generationId,
          workerVersionId: openedRoot.workerVersionId,
        });

        const staleDeployTicket = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).consumeFrontendWebSocketTicket({
            ticket: initialDeployTicket,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(staleDeployTicket._tag).toBe('Left');
        if (staleDeployTicket._tag === 'Left') {
          expect(staleDeployTicket.left.code).toBe(
            'generation-deploy-not-active',
          );
        }

        const activeRepoName = 'frtbrepo_active_target';
        const activeTicket = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).createFrontendWebSocketTicket({
            deployId: reuseDeployId,
            repoName: activeRepoName,
            frontendVersion: '2.0.0',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const consumedAccountTarget = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).consumeFrontendWebSocketTicket({ ticket: activeTicket }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(consumedAccountTarget).toEqual({
          repoName: activeRepoName,
          frontendVersion: '2.0.0',
        });

        const replayedTicket = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).consumeFrontendWebSocketTicket({ ticket: activeTicket }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(replayedTicket._tag).toBe('Left');
        if (replayedTicket._tag === 'Left') {
          expect(replayedTicket.left.code).toBe(
            'frontend-websocket-ticket-invalid',
          );
        }

        const serviceTicket = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).createServiceFrontendWebSocketTicket({
            deployId: reuseDeployId,
            serviceName: 'catalog',
            actorName: 'shopper',
            actorId: 'actr_system_worker_service_ticket',
            frontendName: 'products',
            frontendVersion: '3.0.0',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(serviceTicket).toMatch(
          /^gen_system_worker_lifecycle\.[A-Za-z0-9_-]{43}$/,
        );
        const storedServiceTicket = yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(
              `${systemWorkerAbbreviations.systemRepo}_${generationId}`,
            ),
            (_instance, state) =>
              state.storage.sql
                .exec<{
                  ticketHash: string;
                  deployId: string;
                  serviceName: string;
                  actorName: string;
                  actorId: string;
                  frontendName: string;
                  frontendVersion: string;
                  expiresAt: number;
                }>(
                  'SELECT ticketHash, deployId, serviceName, actorName, actorId, frontendName, frontendVersion, expiresAt FROM serviceFrontendWebSocketTickets WHERE actorId = ?',
                  'actr_system_worker_service_ticket',
                )
                .one(),
          ),
        );
        expect(storedServiceTicket.ticketHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(storedServiceTicket.ticketHash).not.toBe(serviceTicket);
        expect(Object.hasOwn(storedServiceTicket, 'ticket')).toBe(false);
        expect(storedServiceTicket).toMatchObject({
          deployId: reuseDeployId,
          serviceName: 'catalog',
          actorName: 'shopper',
          actorId: 'actr_system_worker_service_ticket',
          frontendName: 'products',
          frontendVersion: '3.0.0',
        });

        const consumedServiceTarget = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).consumeServiceFrontendWebSocketTicket({ ticket: serviceTicket }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(consumedServiceTarget).toEqual({
          serviceName: 'catalog',
          actorName: 'shopper',
          actorId: 'actr_system_worker_service_ticket',
          frontendName: 'products',
          frontendVersion: '3.0.0',
        });

        const expiredServiceTicket = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).createServiceFrontendWebSocketTicket({
            deployId: reuseDeployId,
            serviceName: 'catalog',
            actorName: 'shopper',
            actorId: 'actr_system_worker_expired_service_ticket',
            frontendName: 'products',
            frontendVersion: '3.0.0',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(
              `${systemWorkerAbbreviations.systemRepo}_${generationId}`,
            ),
            (_instance, state) => {
              state.storage.sql.exec(
                'UPDATE serviceFrontendWebSocketTickets SET expiresAt = ? WHERE actorId = ?',
                Math.floor(Date.now() / 1_000) - 1,
                'actr_system_worker_expired_service_ticket',
              );
            },
          ),
        );
        const expiredServiceTicketResult = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).consumeServiceFrontendWebSocketTicket({
            ticket: expiredServiceTicket,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(expiredServiceTicketResult._tag).toBe('Left');
        if (expiredServiceTicketResult._tag === 'Left') {
          expect(expiredServiceTicketResult.left.code).toBe(
            'service-frontend-websocket-ticket-invalid',
          );
        }

        const malformedTicket = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).consumeFrontendWebSocketTicket({ ticket: 'not-base64url' }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(malformedTicket._tag).toBe('Left');
        if (malformedTicket._tag === 'Left') {
          expect(malformedTicket.left.code).toBe(
            'frontend-websocket-ticket-invalid',
          );
        }

        const wrongGenerationTicket = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).consumeFrontendWebSocketTicket({
            ticket: activeTicket.replace(
              `${generationId}.`,
              'gen_wrong_generation.',
            ),
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(wrongGenerationTicket._tag).toBe('Left');
        if (wrongGenerationTicket._tag === 'Left') {
          expect(wrongGenerationTicket.left.code).toBe(
            'frontend-websocket-ticket-invalid',
          );
        }

        const expiredRepoName = 'frtbrepo_expired_target';
        const expiredTicket = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).createFrontendWebSocketTicket({
            deployId: reuseDeployId,
            repoName: expiredRepoName,
            frontendVersion: '2.0.0',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(
              `${systemWorkerAbbreviations.systemRepo}_${generationId}`,
            ),
            (_instance, state) => {
              state.storage.sql.exec(
                'UPDATE frontendWebSocketTickets SET expiresAt = ? WHERE repoName = ?',
                Math.floor(Date.now() / 1_000) - 1,
                expiredRepoName,
              );
            },
          ),
        );
        const expiredTicketResult = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).consumeFrontendWebSocketTicket({ ticket: expiredTicket }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(expiredTicketResult._tag).toBe('Left');
        if (expiredTicketResult._tag === 'Left') {
          expect(expiredTicketResult.left.code).toBe(
            'frontend-websocket-ticket-invalid',
          );
        }

        const staleDeployAdmission = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).assertGenerationAdmission({
            deployId: initialDeployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(staleDeployAdmission._tag).toBe('Left');
        if (staleDeployAdmission._tag === 'Left') {
          expect(staleDeployAdmission.left.code).toBe(
            'generation-deploy-not-active',
          );
        }

        // 4. Only the currently active deploy can freeze. Freezing closes
        //    writes while preserving reads plus fresh ticket mint/consumption.
        const staleDeployDrain = yield* drainGeneration({
          deployId: initialDeployId,
          generationId,
          mode: 'freeze',
          successorGenerationId: null,
        }).pipe(Effect.either);
        expect(staleDeployDrain._tag).toBe('Left');
        if (staleDeployDrain._tag === 'Left') {
          expect(staleDeployDrain.left.code).toBe(
            'generation-drain-deploy-mismatch',
          );
        }

        const drainingRepoName = 'frtbrepo_draining_target';
        const drainingTicket = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).createFrontendWebSocketTicket({
            deployId: reuseDeployId,
            repoName: drainingRepoName,
            frontendVersion: '2.0.0',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const ticketPurgedAtDrain = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).createFrontendWebSocketTicket({
            deployId: reuseDeployId,
            repoName: 'frtbrepo_purge_target',
            frontendVersion: '2.0.0',
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(
              `${systemWorkerAbbreviations.systemRepo}_${generationId}`,
            ),
            (_instance, state) => {
              state.storage.sql.exec(
                "UPDATE generationState SET admission = 'draining' WHERE generationId = ?",
                generationId,
              );
            },
          ),
        );

        const consumedWhileDraining = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).consumeFrontendWebSocketTicket({ ticket: drainingTicket }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(consumedWhileDraining).toEqual({
          repoName: drainingRepoName,
          frontendVersion: '2.0.0',
        });

        const accountTicketMintedWhileDraining = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).createFrontendWebSocketTicket({
            deployId: reuseDeployId,
            repoName: 'frtbrepo_minted_during_drain',
            frontendVersion: '2.0.0',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const accountTargetMintedWhileDraining = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).consumeFrontendWebSocketTicket({
            ticket: accountTicketMintedWhileDraining,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(accountTargetMintedWhileDraining).toEqual({
          repoName: 'frtbrepo_minted_during_drain',
          frontendVersion: '2.0.0',
        });

        const serviceTicketMintedWhileDraining = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).createServiceFrontendWebSocketTicket({
            deployId: reuseDeployId,
            serviceName: 'catalog',
            actorName: 'shopper',
            actorId: 'actr_system_worker_service_ticket_during_drain',
            frontendName: 'products',
            frontendVersion: '3.0.0',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const serviceTargetMintedWhileDraining = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).consumeServiceFrontendWebSocketTicket({
            ticket: serviceTicketMintedWhileDraining,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(serviceTargetMintedWhileDraining).toEqual({
          serviceName: 'catalog',
          actorName: 'shopper',
          actorId: 'actr_system_worker_service_ticket_during_drain',
          frontendName: 'products',
          frontendVersion: '3.0.0',
        });

        const frozen = yield* drainGeneration({
          deployId: reuseDeployId,
          generationId,
          mode: 'freeze',
          successorGenerationId: null,
        });
        expect(frozen).toEqual({
          deployId: reuseDeployId,
          generationId,
          admission: 'draining',
        });

        const frozenState = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(frozenState).toMatchObject({
          generationId,
          activeDeployId: reuseDeployId,
          preparingDeployId: null,
          readiness: 'ready',
          admission: 'draining',
          drainFrozenAt: expect.any(Date),
          successorGenerationId: null,
        });

        const frozenReadAdmission = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).assertGenerationAdmission({
            deployId: reuseDeployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(frozenReadAdmission).toBeUndefined();

        const frozenRetry = yield* drainGeneration({
          deployId: reuseDeployId,
          generationId,
          mode: 'freeze',
          successorGenerationId: null,
        });
        expect(frozenRetry).toEqual(frozen);

        // 5. Post-switch completion closes reads and purges the current
        //    account-frontend ticket table. Repeating completion is idempotent.
        const drained = yield* drainGeneration({
          deployId: reuseDeployId,
          generationId,
          mode: 'complete',
          successorGenerationId,
        });
        expect(drained).toEqual({
          deployId: reuseDeployId,
          generationId,
          admission: 'drained',
        });

        const drainedState = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(drainedState).toMatchObject({
          generationId,
          activeDeployId: reuseDeployId,
          readiness: 'ready',
          admission: 'drained',
          drainFrozenAt: expect.any(Date),
          drainedAt: expect.any(Date),
          successorGenerationId,
        });

        const drainedReadAdmission = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).assertGenerationAdmission({
            deployId: reuseDeployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(drainedReadAdmission._tag).toBe('Left');
        if (drainedReadAdmission._tag === 'Left') {
          expect(drainedReadAdmission.left.code).toBe(
            'generation-read-admission-closed',
          );
        }

        const purgedTicket = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).consumeFrontendWebSocketTicket({ ticket: ticketPurgedAtDrain }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(purgedTicket._tag).toBe('Left');
        if (purgedTicket._tag === 'Left') {
          expect(purgedTicket.left.code).toBe(
            'frontend-websocket-ticket-invalid',
          );
        }

        const mintAfterDrain = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).createFrontendWebSocketTicket({
            deployId: reuseDeployId,
            repoName: 'frtbrepo_rejected_after_drain',
            frontendVersion: '2.0.0',
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(mintAfterDrain._tag).toBe('Left');
        if (mintAfterDrain._tag === 'Left') {
          expect(mintAfterDrain.left.code).toBe(
            'generation-read-admission-closed',
          );
        }

        const serviceMintAfterDrain = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).createServiceFrontendWebSocketTicket({
            deployId: reuseDeployId,
            serviceName: 'catalog',
            actorName: 'shopper',
            actorId: 'actr_system_worker_service_ticket_after_drain',
            frontendName: 'products',
            frontendVersion: '3.0.0',
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(serviceMintAfterDrain._tag).toBe('Left');
        if (serviceMintAfterDrain._tag === 'Left') {
          expect(serviceMintAfterDrain.left.code).toBe(
            'generation-read-admission-closed',
          );
        }

        const drainedWriteAdmission = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).assertGenerationAdmission({
            deployId: reuseDeployId,
            mode: 'write',
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(drainedWriteAdmission._tag).toBe('Left');
        if (drainedWriteAdmission._tag === 'Left') {
          expect(drainedWriteAdmission.left.code).toBe(
            'generation-write-admission-closed',
          );
        }

        const completedRetry = yield* drainGeneration({
          deployId: reuseDeployId,
          generationId,
          mode: 'complete',
          successorGenerationId,
        });
        expect(completedRetry).toEqual(drained);

        const conflictingSuccessor = yield* drainGeneration({
          deployId: reuseDeployId,
          generationId,
          mode: 'complete',
          successorGenerationId:
            'gen_system_worker_lifecycle_conflicting_successor',
        }).pipe(Effect.either);
        expect(conflictingSuccessor._tag).toBe('Left');
        if (conflictingSuccessor._tag === 'Left') {
          expect(conflictingSuccessor.left.code).toBe(
            'generation-drain-successor-conflict',
          );
        }
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('rejects open and drain before generation preparation', () =>
    Effect.gen(function* () {
      const generationId = 'gen_system_worker_unprepared';
      const deployId = 'dpl_system_worker_unprepared';

      // 1. Neither lifecycle RPC is allowed to create or repair missing state.
      const unpreparedOpen = yield* openGeneration({
        deployId,
        generationId,
      }).pipe(Effect.either);
      expect(unpreparedOpen._tag).toBe('Left');
      if (unpreparedOpen._tag === 'Left') {
        expect(unpreparedOpen.left.code).toBe('generation-open-not-prepared');
      }

      const unpreparedDrain = yield* drainGeneration({
        deployId,
        generationId,
        mode: 'freeze',
        successorGenerationId: null,
      }).pipe(Effect.either);
      expect(unpreparedDrain._tag).toBe('Left');
      if (unpreparedDrain._tag === 'Left') {
        expect(unpreparedDrain.left.code).toBe('generation-drain-not-prepared');
      }

      const missingState = yield* makeAsync(() =>
        SystemRepo.getRepo({ generationId }).getGenerationState(),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(missingState).toBeNull();
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'keeps an admitted projection reservation inside the finite freeze bound',
    () =>
      Effect.gen(function* () {
        const generationId = 'gen_system_worker_projection_reservation';
        const deployId = 'dpl_system_worker_projection_reservation';
        const actorId = prefixActorId('system-worker-projection-reservation');

        yield* prepareGeneration({
          deployId,
          generationId,
          prevGenerationId: null,
          systemSpec: makeSystemSpec({ system }),
          seeds: [],
        });
        yield* openGeneration({ deployId, generationId });

        const reservedLineage = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).resolveFrontendProjectionLineage({
            deployId,
            target: {
              kind: 'service',
              serviceName: 'app',
              actorName: 'reservationActor',
              actorId,
              frontendName: 'reservationFrontend',
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(reservedLineage).toEqual({
          mode: 'live',
          predecessor: null,
        });

        const reservedState = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(reservedState?.drainBounds).toEqual([
          expect.objectContaining({
            repoType: 'ServiceFrontendRepo',
            systemWorkerName: null,
            frontendBlockRepoName: null,
            terminalFrontendIndex: null,
            segmentKind: 'root',
          }),
        ]);

        const blockedFreeze = yield* drainGeneration({
          deployId,
          generationId,
          mode: 'freeze',
          successorGenerationId: null,
        }).pipe(Effect.either);
        expect(blockedFreeze._tag).toBe('Left');
        if (blockedFreeze._tag === 'Left') {
          expect(blockedFreeze.left.code).toBe(
            'generation-replay-bounds-incomplete',
          );
        }

        const drainingState = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(drainingState).toMatchObject({
          admission: 'draining',
          drainFrozenAt: null,
        });

        const reservedRetry = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).resolveFrontendProjectionLineage({
            deployId,
            target: {
              kind: 'service',
              serviceName: 'app',
              actorName: 'reservationActor',
              actorId,
              frontendName: 'reservationFrontend',
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(reservedRetry).toEqual(reservedLineage);
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'keeps a projection live until the drain freeze marker is durable',
    () =>
      Effect.gen(function* () {
        const generationId = 'gen_system_worker_projection_before_freeze';
        const deployId = 'dpl_system_worker_projection_before_freeze';
        const actorId = prefixActorId('system-worker-projection-before-freeze');

        yield* prepareGeneration({
          deployId,
          generationId,
          prevGenerationId: null,
          systemSpec: makeSystemSpec({ system }),
          seeds: [],
        });
        yield* openGeneration({ deployId, generationId });

        // 1. Hold one admitted write so the generation is observably draining
        //    while drainFrozenAt is still null.
        const systemRepo = SystemRepo.getRepo({ generationId });
        const reservationId = yield* makeAsync(() =>
          systemRepo.reserveGenerationWrite({
            deployId,
            operationName: 'pushCommands',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const freezePromise = systemRepo.drainGeneration({
          deployId,
          mode: 'freeze',
          successorGenerationId: null,
        });
        const drainingState = yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(
              `${systemWorkerAbbreviations.systemRepo}_${generationId}`,
            ),
            (_instance, state) =>
              state.storage.sql
                .exec<{
                  admission: string;
                  drainFrozenAt: number | null;
                }>(
                  'SELECT admission, drainFrozenAt FROM generationState WHERE generationId = ?',
                  generationId,
                )
                .one(),
          ),
        );
        expect(drainingState).toEqual({
          admission: 'draining',
          drainFrozenAt: null,
        });

        // 2. A projection first requested in this pre-freeze window is still a
        //    live segment. Its incomplete row forces freeze to include it on a
        //    retry instead of returning an unsafe snapshot-only projection.
        const lineage = yield* makeAsync(() =>
          systemRepo.resolveFrontendProjectionLineage({
            deployId,
            target: {
              kind: 'service',
              serviceName: 'app',
              actorName: 'beforeFreezeActor',
              actorId,
              frontendName: 'beforeFreezeFrontend',
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(lineage).toEqual({ mode: 'live', predecessor: null });

        const stateWithLiveReservation = yield* makeAsync(() =>
          systemRepo.getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(stateWithLiveReservation?.drainBounds).toEqual([
          expect.objectContaining({
            deployId,
            repoType: 'ServiceFrontendRepo',
            systemWorkerName: null,
            frontendBlockRepoName: null,
            terminalFrontendIndex: null,
          }),
        ]);

        yield* makeAsync(() =>
          systemRepo.releaseGenerationWrite({ deployId, reservationId }),
        ).pipe(Effect.flatMap(decodeRpc));
        const blockedFreeze = yield* makeAsync(() => freezePromise).pipe(
          Effect.flatMap(decodeRpc),
          Effect.either,
        );
        expect(blockedFreeze._tag).toBe('Left');
        if (blockedFreeze._tag === 'Left') {
          expect(blockedFreeze.left.code).toBe(
            'generation-replay-bounds-incomplete',
          );
        }
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'waits for an older deploy write reservation after compatible generation reuse',
    () =>
      Effect.gen(function* () {
        const generationId = 'gen_system_worker_reused_write_reservation';
        const initialDeployId =
          'dpl_system_worker_reused_write_reservation_initial';
        const reuseDeployId = 'dpl_system_worker_reused_write_reservation_next';
        const systemSpec = makeSystemSpec({ system });

        yield* prepareGeneration({
          deployId: initialDeployId,
          generationId,
          prevGenerationId: null,
          systemSpec,
          seeds: [],
        });
        yield* openGeneration({ deployId: initialDeployId, generationId });

        // 1. The old deploy admits work before compatible reuse atomically
        //    changes activeDeployId.
        const systemRepo = SystemRepo.getRepo({ generationId });
        const reservationId = yield* makeAsync(() =>
          systemRepo.reserveGenerationWrite({
            deployId: initialDeployId,
            operationName: 'finalizeServiceCommands',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* prepareGeneration({
          deployId: reuseDeployId,
          generationId,
          prevGenerationId: null,
          systemSpec,
          seeds: [],
        });
        yield* openGeneration({ deployId: reuseDeployId, generationId });

        // 2. Freeze for the new deploy must wait on the complete generation
        //    lease set, including the row whose provenance remains the old
        //    deploy. The storage inspection is the deterministic wait barrier.
        const freezePromise = systemRepo.drainGeneration({
          deployId: reuseDeployId,
          mode: 'freeze',
          successorGenerationId: null,
        });
        const waitingState = yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(
              `${systemWorkerAbbreviations.systemRepo}_${generationId}`,
            ),
            (_instance, state) => ({
              generationState: state.storage.sql
                .exec<{
                  admission: string;
                  drainFrozenAt: number | null;
                }>(
                  'SELECT admission, drainFrozenAt FROM generationState WHERE generationId = ?',
                  generationId,
                )
                .one(),
              reservations: state.storage.sql
                .exec<{ deployId: string; reservationId: string }>(
                  'SELECT deployId, reservationId FROM generationWriteReservations',
                )
                .toArray(),
            }),
          ),
        );
        expect(waitingState.generationState).toEqual({
          admission: 'draining',
          drainFrozenAt: null,
        });
        expect(waitingState.reservations).toEqual([
          { deployId: initialDeployId, reservationId },
        ]);

        // 3. The old capability can still release its own lease. Only then may
        //    the active reused deploy persist the terminal freeze marker.
        yield* makeAsync(() =>
          systemRepo.releaseGenerationWrite({
            deployId: initialDeployId,
            reservationId,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const frozen = yield* makeAsync(() => freezePromise).pipe(
          Effect.flatMap(decodeRpc),
        );
        expect(frozen).toEqual({
          deployId: reuseDeployId,
          generationId,
          admission: 'draining',
        });

        const frozenState = yield* makeAsync(() =>
          systemRepo.getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(frozenState).toMatchObject({
          activeDeployId: reuseDeployId,
          admission: 'draining',
          drainFrozenAt: expect.any(Date),
        });
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'transfers an older deploy live projection reservation during compatible reuse',
    () =>
      Effect.gen(function* () {
        const generationId = 'gen_system_worker_reused_projection_reservation';
        const initialDeployId =
          'dpl_system_worker_reused_projection_reservation_initial';
        const reuseDeployId =
          'dpl_system_worker_reused_projection_reservation_next';
        const actorId = prefixActorId(
          'system-worker-reused-projection-reservation',
        );
        const systemSpec = makeSystemSpec({ system });

        yield* prepareGeneration({
          deployId: initialDeployId,
          generationId,
          prevGenerationId: null,
          systemSpec,
          seeds: [],
        });
        yield* openGeneration({ deployId: initialDeployId, generationId });

        // 1. Resolve the live lineage but deliberately stop before creating its
        //    downstream projection. The incomplete row is the admission receipt
        //    that compatible reuse must preserve.
        const systemRepo = SystemRepo.getRepo({ generationId });
        const lineage = yield* makeAsync(() =>
          systemRepo.resolveFrontendProjectionLineage({
            deployId: initialDeployId,
            target: {
              kind: 'service',
              serviceName: 'app',
              actorName: 'reusedReservationActor',
              actorId,
              frontendName: 'reusedReservationFrontend',
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(lineage).toEqual({ mode: 'live', predecessor: null });

        // 2. Opening the compatible deploy transfers every generation-local
        //    projection receipt in the same SQLite transaction as activeDeployId.
        yield* prepareGeneration({
          deployId: reuseDeployId,
          generationId,
          prevGenerationId: null,
          systemSpec,
          seeds: [],
        });
        yield* openGeneration({ deployId: reuseDeployId, generationId });
        const transferredReservations = yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(
              `${systemWorkerAbbreviations.systemRepo}_${generationId}`,
            ),
            (_instance, state) =>
              state.storage.sql
                .exec<{
                  deployId: string;
                  repoType: string;
                  systemWorkerName: string | null;
                  frontendBlockRepoName: string | null;
                  terminalFrontendIndex: number | null;
                }>(
                  `SELECT deployId,
                          repoType,
                          systemWorkerName,
                          frontendBlockRepoName,
                          terminalFrontendIndex
                   FROM drainBounds`,
                )
                .toArray(),
          ),
        );
        expect(transferredReservations).toEqual([
          {
            deployId: reuseDeployId,
            repoType: 'ServiceFrontendRepo',
            systemWorkerName: null,
            frontendBlockRepoName: null,
            terminalFrontendIndex: null,
          },
        ]);

        // 3. The new deploy cannot freeze around the old resolver. It retains
        //    the incomplete receipt and fails visibly until downstream
        //    materialization registers the projection for the next retry.
        const blockedFreeze = yield* drainGeneration({
          deployId: reuseDeployId,
          generationId,
          mode: 'freeze',
          successorGenerationId: null,
        }).pipe(Effect.either);
        expect(blockedFreeze._tag).toBe('Left');
        if (blockedFreeze._tag === 'Left') {
          expect(blockedFreeze.left.code).toBe(
            'generation-replay-bounds-incomplete',
          );
        }

        const blockedState = yield* makeAsync(() =>
          systemRepo.getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(blockedState).toMatchObject({
          activeDeployId: reuseDeployId,
          admission: 'draining',
          drainFrozenAt: null,
        });
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'waits for an admitted account result and force-drains delayed actor fanout before freezing its frontend bound',
    () =>
      Effect.gen(function* () {
        const generationId = 'gen_system_worker_finite_write_drain';
        const deployId = 'dpl_system_worker_finite_write_drain';
        const accountId = makeAccountId({ id: 'finite-write-drain' });
        const actorId = prefixActorId('finite-write-drain');
        const actorKey = {
          generationId,
          accountId,
          accountName: main.accountName,
          actorId,
          actorName: main.actorName,
        };
        const frontendKey = {
          ...actorKey,
          frontendName: main.frontendName,
        };

        yield* prepareGeneration({
          deployId,
          generationId,
          prevGenerationId: null,
          systemSpec: makeSystemSpec({ system }),
          seeds: [],
        });
        yield* openGeneration({ deployId, generationId });

        // 1. Bootstrap the live projection and its ActorBlockRepo subscriber
        // before closing admission. This also registers every drain tier that
        // the accepted account result can reach.
        const frontendRepo = yield* getFrontendRepo({ key: frontendKey });
        yield* makeAsync(() =>
          frontendRepo.getFrontendState({
            accountId,
            accountName: main.accountName,
            actorId,
            actorName: main.actorName,
            frontendName: main.frontendName,
            systemWorkerName: 'system-worker-finite-write-drain',
            lineage: { mode: 'live', predecessor: null },
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const frontendRepoName =
          yield* FrontendRepo.repoUtils.nameUtils.makeName(frontendKey);
        const frontendBlockRepoName =
          yield* FrontendBlockRepo.repoUtils.nameUtils.makeName(frontendKey);
        const actorBlockRepoName =
          yield* ActorBlockRepo.repoUtils.nameUtils.makeName(actorKey);
        const frontendRetryAt = Date.now() + 60_000;
        yield* Effect.promise(() =>
          runInDurableObject(
            env.ACTOR_BLOCK_REPO.getByName(actorBlockRepoName),
            (_instance, state) => {
              state.storage.sql.exec(
                `UPDATE frontendSubscribers
                 SET currentAccountCursor = NULL,
                     currentAccountIndex = NULL,
                     deliveryAttempts = 1,
                     nextRetryAt = ?,
                     lastDeliveryError = ?
                 WHERE frontendRepoName = ?`,
                frontendRetryAt,
                'delayed until the generation drain forces delivery',
                frontendRepoName,
              );
            },
          ),
        );

        // 2. The reservation is committed before freeze closes the same
        // SQLite gate. The later durable-object inspection is the barrier that
        // proves freeze is waiting rather than guessing with a sleep.
        const systemRepo = SystemRepo.getRepo({ generationId });
        const reservationId = yield* makeAsync(() =>
          systemRepo.reserveGenerationWrite({
            deployId,
            operationName: 'finalizeAccountBlock',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const freezePromise = systemRepo.drainGeneration({
          deployId,
          mode: 'freeze',
          successorGenerationId: null,
        });
        const waitingState = yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(
              `${systemWorkerAbbreviations.systemRepo}_${generationId}`,
            ),
            (_instance, state) => ({
              generationState: state.storage.sql
                .exec<{
                  admission: string;
                  drainFrozenAt: number | null;
                }>(
                  'SELECT admission, drainFrozenAt FROM generationState WHERE generationId = ?',
                  generationId,
                )
                .one(),
              reservations: state.storage.sql
                .exec<{
                  reservationId: string;
                  operationName: string;
                }>(
                  'SELECT reservationId, operationName FROM generationWriteReservations WHERE deployId = ?',
                  deployId,
                )
                .toArray(),
            }),
          ),
        );
        expect(waitingState.generationState).toEqual({
          admission: 'draining',
          drainFrozenAt: null,
        });
        expect(waitingState.reservations).toEqual([
          { reservationId, operationName: 'finalizeAccountBlock' },
        ]);

        // 3. Once the gate is closed no second write can reserve a slot, but
        // the already-admitted account result may still durably cross into the
        // actor pipeline before releasing its reservation.
        const rejectedReservation = yield* makeAsync(() =>
          systemRepo.reserveGenerationWrite({
            deployId,
            operationName: 'pushCommands',
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(rejectedReservation._tag).toBe('Left');
        if (rejectedReservation._tag === 'Left') {
          expect(rejectedReservation.left.code).toBe(
            'generation-write-admission-closed',
          );
        }

        const accountCursor = Schema.decodeUnknownSync(
          makeAbbreviationIdSchema(coreAbbreviations.accountCursor),
        )('acur_system_worker_finite_write_drain');
        const actorRepo = yield* getActorRepo({ key: actorKey });
        yield* makeTraceableRpcTarget<Pick<ActorRepo, 'handleAccountBlocks'>>(
          actorRepo,
        )
          .handleAccountBlocks([
            {
              pushedBlockId: null,
              executedCommands: [],
              failedCommands: [],
              appliedMutations: [],
              lastAccountCursor: accountCursor,
              accountIndex: 1,
            },
          ])
          .pipe(
            Effect.provideService(TelemetryCollector, makeTelemetryCollector()),
            Effect.catchAll(error => Effect.die(error)),
          );
        yield* makeAsync(() =>
          systemRepo.releaseGenerationWrite({ deployId, reservationId }),
        ).pipe(Effect.flatMap(decodeRpc));

        const selfHostedFreeze = yield* makeAsync(() => freezePromise).pipe(
          Effect.flatMap(decodeRpc),
          Effect.either,
        );
        expect(selfHostedFreeze._tag).toBe('Left');
        if (selfHostedFreeze._tag === 'Left') {
          expect(selfHostedFreeze.left.code).toBe(
            'actor-block-generation-self-hosted-drain-required',
          );
        }

        const retainedLocalSubscriber = yield* Effect.promise(() =>
          runInDurableObject(
            env.ACTOR_BLOCK_REPO.getByName(actorBlockRepoName),
            (_instance, state) =>
              state.storage.sql
                .exec<{
                  currentAccountCursor: string | null;
                  currentAccountIndex: number | null;
                  nextRetryAt: number | null;
                  lastDeliveryError: string | null;
                }>(
                  `SELECT currentAccountCursor,
                          currentAccountIndex,
                          nextRetryAt,
                          lastDeliveryError
                   FROM frontendSubscribers
                   WHERE frontendRepoName = ?`,
                  frontendRepoName,
                )
                .one(),
          ),
        );
        expect(retainedLocalSubscriber).toEqual({
          currentAccountCursor: null,
          currentAccountIndex: null,
          nextRetryAt: frontendRetryAt,
          lastDeliveryError:
            'delayed until the generation drain forces delivery',
        });

        // The workerd fixture uses self-hosted generation control. Exercise
        // the hosted drain Effect directly to prove old-code delivery can make
        // bounded durable progress, then retry the same closed generation
        // freeze.
        const hostedActorBlockDrain = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getActorBlockRepo,
            repo: ActorBlockRepo,
            key: actorKey,
            fn: ({ db, storage }) =>
              managedRuntime.runPromise(
                drainFrontendSubscribers({
                  db,
                  forceRetryNow: true,
                  inspectionOnly: false,
                  storage,
                }).pipe(Effect.provide(AsyncLive)),
              ),
          }),
        );
        expect(hostedActorBlockDrain).toEqual({
          pendingFrontendSubscriberCount: 0,
        });

        const frozen = yield* makeAsync(() =>
          systemRepo.drainGeneration({
            deployId,
            mode: 'freeze',
            successorGenerationId: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(frozen).toEqual({
          deployId,
          generationId,
          admission: 'draining',
        });

        // 4. Hosted old-code delivery cleared the retry and FrontendRepo
        // archived the resulting block before the retried freeze captured 1.
        const frozenState = yield* makeAsync(() =>
          systemRepo.getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(frozenState).toMatchObject({
          admission: 'draining',
          drainFrozenAt: expect.any(Date),
        });
        expect(frozenState?.drainBounds).toContainEqual(
          expect.objectContaining({
            repoType: 'FrontendRepo',
            repoName: frontendRepoName,
            frontendBlockRepoName,
            terminalFrontendIndex: 1,
          }),
        );

        const drainedActorSubscriber = yield* Effect.promise(() =>
          runInDurableObject(
            env.ACTOR_BLOCK_REPO.getByName(actorBlockRepoName),
            (_instance, state) =>
              state.storage.sql
                .exec<{
                  currentAccountCursor: string | null;
                  currentAccountIndex: number | null;
                  nextRetryAt: number | null;
                  lastDeliveryError: string | null;
                }>(
                  `SELECT currentAccountCursor,
                          currentAccountIndex,
                          nextRetryAt,
                          lastDeliveryError
                   FROM frontendSubscribers
                   WHERE frontendRepoName = ?`,
                  frontendRepoName,
                )
                .one(),
          ),
        );
        expect(drainedActorSubscriber).toEqual({
          currentAccountCursor: accountCursor,
          currentAccountIndex: 1,
          nextRetryAt: null,
          lastDeliveryError: null,
        });

        const archivedFrontendBlocks = yield* Effect.promise(() =>
          runInDurableObject(
            env.FRONTEND_BLOCK_REPO.getByName(frontendBlockRepoName),
            (_instance, state) =>
              state.storage.sql
                .exec<{ frontendIndex: number }>(
                  'SELECT frontendIndex FROM frontendBlocks ORDER BY frontendIndex',
                )
                .toArray(),
          ),
        );
        expect(archivedFrontendBlocks).toEqual([{ frontendIndex: 1 }]);
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'retains an abandoned write reservation and returns its typed freeze failure',
    () =>
      Effect.gen(function* () {
        const generationId = 'gen_system_worker_abandoned_write';
        const deployId = 'dpl_system_worker_abandoned_write';

        yield* prepareGeneration({
          deployId,
          generationId,
          prevGenerationId: null,
          systemSpec: makeSystemSpec({ system }),
          seeds: [],
        });
        yield* openGeneration({ deployId, generationId });

        const systemRepo = SystemRepo.getRepo({ generationId });
        const reservationId = yield* makeAsync(() =>
          systemRepo.reserveGenerationWrite({
            deployId,
            operationName: 'authenticate',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const systemRepoStub = env.SYSTEM_REPO.getByName(
          `${systemWorkerAbbreviations.systemRepo}_${generationId}`,
        );
        yield* Effect.promise(() =>
          runInDurableObject(systemRepoStub, (_instance, state) => {
            state.storage.sql.exec(
              'UPDATE generationWriteReservations SET reservedAt = ? WHERE reservationId = ?',
              Math.floor((Date.now() - 31_000) / 1000),
              reservationId,
            );
          }),
        );

        const abandonedFreeze = yield* makeAsync(() =>
          systemRepo.drainGeneration({
            deployId,
            mode: 'freeze',
            successorGenerationId: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(abandonedFreeze._tag).toBe('Left');
        if (abandonedFreeze._tag === 'Left') {
          expect(abandonedFreeze.left.code).toBe(
            'generation-write-reservation-abandoned',
          );
          expect(abandonedFreeze.left.extra).toMatchObject({
            reservationCount: 1,
            reservationId,
            operationName: 'authenticate',
          });
        }

        const retained = yield* Effect.promise(() =>
          runInDurableObject(systemRepoStub, (_instance, state) => ({
            generationState: state.storage.sql
              .exec<{
                admission: string;
                drainFrozenAt: number | null;
              }>(
                'SELECT admission, drainFrozenAt FROM generationState WHERE generationId = ?',
                generationId,
              )
              .one(),
            reservations: state.storage.sql
              .exec<{ reservationId: string }>(
                'SELECT reservationId FROM generationWriteReservations WHERE deployId = ?',
                deployId,
              )
              .toArray(),
          })),
        );
        expect(retained.generationState).toEqual({
          admission: 'draining',
          drainFrozenAt: null,
        });
        expect(retained.reservations).toEqual([{ reservationId }]);

        // Release stays admitted after closure and remains idempotent. A retry
        // can then finish the same finite drain without deleting stale rows on
        // the freeze path itself.
        yield* makeAsync(() =>
          systemRepo.releaseGenerationWrite({ deployId, reservationId }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* makeAsync(() =>
          systemRepo.releaseGenerationWrite({ deployId, reservationId }),
        ).pipe(Effect.flatMap(decodeRpc));
        const retriedFreeze = yield* makeAsync(() =>
          systemRepo.drainGeneration({
            deployId,
            mode: 'freeze',
            successorGenerationId: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(retriedFreeze.admission).toBe('draining');
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'inserts and consumes a frontend ticket after the finite write gate closes',
    () =>
      Effect.gen(function* () {
        const generationId = 'gen_system_worker_ticket_gate';
        const deployId = 'dpl_system_worker_ticket_gate';

        yield* prepareGeneration({
          deployId,
          generationId,
          prevGenerationId: null,
          systemSpec: makeSystemSpec({ system }),
          seeds: [],
        });
        yield* openGeneration({ deployId, generationId });

        const systemRepo = SystemRepo.getRepo({ generationId });
        const reservationId = yield* makeAsync(() =>
          systemRepo.reserveGenerationWrite({
            deployId,
            operationName: 'appendTelemetryBatch',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const freezePromise = systemRepo.drainGeneration({
          deployId,
          mode: 'freeze',
          successorGenerationId: null,
        });
        const systemRepoStub = env.SYSTEM_REPO.getByName(
          `${systemWorkerAbbreviations.systemRepo}_${generationId}`,
        );
        const gateState = yield* Effect.promise(() =>
          runInDurableObject(systemRepoStub, (_instance, state) =>
            state.storage.sql
              .exec<{ admission: string }>(
                'SELECT admission FROM generationState WHERE generationId = ?',
                generationId,
              )
              .one(),
          ),
        );
        expect(gateState.admission).toBe('draining');

        const admittedTicket = yield* makeAsync(() =>
          systemRepo.createFrontendWebSocketTicket({
            deployId,
            repoName: 'frtbrepo_admitted_after_write_gate',
            frontendVersion: '1.0.0',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(admittedTicket).toMatch(
          /^gen_system_worker_ticket_gate\.[A-Za-z0-9_-]{43}$/,
        );

        const storedTicketCount = yield* Effect.promise(() =>
          runInDurableObject(systemRepoStub, (_instance, state) =>
            state.storage.sql
              .exec<{ ticketCount: number }>(
                'SELECT COUNT(*) AS ticketCount FROM frontendWebSocketTickets',
              )
              .one(),
          ),
        );
        expect(storedTicketCount.ticketCount).toBe(1);

        const consumedTicket = yield* makeAsync(() =>
          systemRepo.consumeFrontendWebSocketTicket({
            ticket: admittedTicket,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(consumedTicket).toEqual({
          repoName: 'frtbrepo_admitted_after_write_gate',
          frontendVersion: '1.0.0',
        });

        yield* makeAsync(() =>
          systemRepo.releaseGenerationWrite({ deployId, reservationId }),
        ).pipe(Effect.flatMap(decodeRpc));
        const frozen = yield* makeAsync(() => freezePromise).pipe(
          Effect.flatMap(decodeRpc),
        );
        expect(frozen.admission).toBe('draining');
      }).pipe(Effect.provide(AsyncLive)),
  );
});
