/*
 * System-worker lifecycle integration coverage:
 *
 * 1. Prepare and open one detached root generation.
 * 2. Reuse that ready generation for a compatible successor deploy.
 * 3. Drain the active successor and prove ordinary admission is closed.
 * 4. Reject open and drain requests that have no prepared generation state.
 */

import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { system } from './fixtures/system.js';
import { openGeneration } from './openGeneration/openGeneration.js';
import { prepareGeneration } from './prepareGeneration/prepareGeneration.js';
import { SystemRepo } from './SystemRepo/SystemRepo.js';

describe('SystemWorker generation lifecycle', () => {
  it.effect(
    'prepares, opens, reuses, and drains one generation with exact deploy admission',
    () =>
      Effect.gen(function* () {
        const generationId = 'gen_system_worker_lifecycle';
        const initialDeployId = 'dpl_system_worker_initial';
        const reuseDeployId = 'dpl_system_worker_reuse';
        const systemSpec = makeSystemSpec({ system });

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

        // 4. Only the currently active deploy can drain. Completion closes
        //    both read and write admission while retaining the ready lineage.
        const staleDeployDrain = yield* drainGeneration({
          deployId: initialDeployId,
          generationId,
        }).pipe(Effect.either);
        expect(staleDeployDrain._tag).toBe('Left');
        if (staleDeployDrain._tag === 'Left') {
          expect(staleDeployDrain.left.code).toBe(
            'generation-drain-deploy-mismatch',
          );
        }

        const drained = yield* drainGeneration({
          deployId: reuseDeployId,
          generationId,
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
          preparingDeployId: null,
          readiness: 'ready',
          admission: 'drained',
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
      }).pipe(Effect.either);
      expect(unpreparedDrain._tag).toBe('Left');
      if (unpreparedDrain._tag === 'Left') {
        expect(unpreparedDrain.left.code).toBe(
          'generation-drain-not-prepared',
        );
      }

      const missingState = yield* makeAsync(() =>
        SystemRepo.getRepo({ generationId }).getGenerationState(),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(missingState).toBeNull();
    }).pipe(Effect.provide(AsyncLive)),
  );
});
