import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { env, runInDurableObject } from 'cloudflare:test';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { main } from '../../fixtures/system.js';
import { prepareGenerationStateFixture } from '../../workerd-utils/prepareGenerationStateFixture.js';
import { SystemRepo } from '../SystemRepo.js';

describe('SystemRepo.resolveFrontendProjectionLineage', () => {
  it.effect(
    'returns no archive predecessor while open or draining and fences retirement',
    () =>
      Effect.gen(function* () {
        const active = yield* prepareGenerationStateFixture({
          clean: false,
          workerVersionId: 'lineage-read-phase',
        });
        const aggregateId = makeAggregateId({ id: 'lineage-current' });
        const userId = 'usr_lineage_current';
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });

        const resolve = () =>
          makeAsync(() =>
            systemRepo.resolveFrontendProjectionLineage({
              generationId: active.generationId,
              target: {
                kind: 'aggregate',
                aggregateId,
                aggregateName: main.aggregateName,
                userId,
                frontendName: main.frontendName,
              },
            }),
          ).pipe(Effect.flatMap(decodeRpc));

        expect(yield* resolve()).toEqual({ predecessor: null });

        yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) => {
            state.storage.sql.exec(
              "UPDATE generationState SET phase = 'draining' WHERE generationId = ?",
              active.generationId,
            );
          }),
        );
        expect(yield* resolve()).toEqual({ predecessor: null });

        yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) => {
            state.storage.sql.exec(
              "UPDATE generationState SET phase = 'retired', retiredAt = ? WHERE generationId = ?",
              Date.now(),
              active.generationId,
            );
          }),
        );
        const retired = yield* resolve().pipe(Effect.either);
        expect(retired._tag).toBe('Left');
        if (retired._tag === 'Left') {
          expect(retired.left.code).toBe(
            'aggregate-frontend-lineage-read-admission-closed',
          );
          expect(retired.left.extra).toMatchObject({
            generationId: active.generationId,
            phase: 'retired',
          });
        }
      }).pipe(Effect.provide(AsyncLive)),
  );
});
