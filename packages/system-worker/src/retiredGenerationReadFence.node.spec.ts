import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { ZerospinError } from '@zerospin/error';
import { Effect, Either } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authorizeAggregateFrontend } from './authorizeAggregateFrontend/authorizeAggregateFrontend.js';
import { authorizeServiceFrontend } from './authorizeServiceFrontend/authorizeServiceFrontend.js';
import { executeAggregateQuery } from './executeAggregateQuery/executeAggregateQuery.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { main, system } from './fixtures/system.js';
import { getAggregateFrontendState } from './getAggregateFrontendState/getAggregateFrontendState.js';
import { getServiceFrontendState } from './getServiceFrontendState/getServiceFrontendState.js';

const {
  assertGenerationAdmission,
  getAggregateFrontendRepo,
  getAggregateRepo,
  getServiceFrontendRepo,
  getServiceRepo,
  getSystemRepo,
  resolveFrontendProjectionLineage,
} = vi.hoisted(() => ({
  assertGenerationAdmission: vi.fn(),
  getAggregateFrontendRepo: vi.fn(),
  getAggregateRepo: vi.fn(),
  getServiceFrontendRepo: vi.fn(),
  getServiceRepo: vi.fn(),
  getSystemRepo: vi.fn(),
  resolveFrontendProjectionLineage: vi.fn(),
}));

vi.mock(
  './AggregateFrontendRepo/getAggregateFrontendRepo/getAggregateFrontendRepo.js',
  () => ({
    getAggregateFrontendRepo,
  }),
);
vi.mock('./AggregateRepo/getAggregateRepo/getAggregateRepo.js', () => ({
  getAggregateRepo,
}));
vi.mock(
  './ServiceFrontendRepo/getServiceFrontendRepo/getServiceFrontendRepo.js',
  () => ({
    getServiceFrontendRepo,
  }),
);
vi.mock('./ServiceRepo/getServiceRepo/getServiceRepo.js', () => ({
  getServiceRepo,
}));
vi.mock('./SystemRepo/SystemRepo.js', () => ({
  SystemRepo: { getRepo: getSystemRepo },
}));

describe('retired-generation read fences', () => {
  beforeEach(() => {
    assertGenerationAdmission.mockReset();
    getAggregateFrontendRepo.mockReset();
    getAggregateRepo.mockReset();
    getServiceFrontendRepo.mockReset();
    getServiceRepo.mockReset();
    getSystemRepo.mockReset();
    resolveFrontendProjectionLineage.mockReset();

    assertGenerationAdmission.mockResolvedValue(
      encodeLeft(
        new ZerospinError({
          code: 'generation-read-admission-closed',
          message: 'Read admission is closed for this generation',
          extra: { generationId: 'gen_retired', phase: 'retired' },
        }),
      ),
    );
    getSystemRepo.mockReturnValue({
      assertGenerationAdmission,
      resolveFrontendProjectionLineage,
    });
  });

  it('rejects every generation-keyed authorization, state, and query before child lookup', async () => {
    const systemSpec = makeSystemSpec({ system });
    const aggregateFrontendLock =
      systemSpec.aggregates[main.aggregateName]?.frontends[main.frontendName]
        ?.controller.aggregateFrontendLock;
    const serviceFrontendLock =
      systemSpec.services.app?.frontends.products?.controller
        .serviceFrontendLock;
    if (
      aggregateFrontendLock === undefined ||
      serviceFrontendLock === undefined
    ) {
      throw new Error('Fixture frontend locks are missing');
    }
    const actorRef = {
      aggregateId: makeAggregateId({ id: 'retired-read-fence' }),
      aggregateName: main.aggregateName,
      userId: 'usr_retired_read_fence',
    };

    const results = await Effect.runPromise(
      Effect.all(
        [
          authorizeAggregateFrontend({
            generationId: 'gen_retired',
            userId: actorRef.userId,
            aggregateId: actorRef.aggregateId,
            aggregateName: actorRef.aggregateName,
            frontendName: main.frontendName,
            aggregateFrontendLock,
          }).pipe(Effect.asVoid, Effect.either),
          authorizeServiceFrontend({
            generationId: 'gen_retired',
            userId: actorRef.userId,
            serviceName: 'app',
            frontendName: 'products',
            serviceFrontendLock,
          }).pipe(Effect.asVoid, Effect.either),
          getAggregateFrontendState({
            generationId: 'gen_retired',
            actorRef,
            frontendName: main.frontendName,
            aggregateFrontendLock,
          }).pipe(Effect.asVoid, Effect.either),
          getServiceFrontendState({
            generationId: 'gen_retired',
            serviceName: 'app',
            userId: actorRef.userId,
            frontendName: 'products',
            serviceFrontendLock,
          }).pipe(Effect.asVoid, Effect.either),
          executeAggregateQuery({
            generationId: 'gen_retired',
            actorRef,
            frontendName: main.frontendName,
            aggregateFrontendLock,
            queryName: 'getProducts',
            params: {},
          }).pipe(Effect.asVoid, Effect.either),
          executeServiceQuery({
            generationId: 'gen_retired',
            serviceName: 'app',
            queryName: 'getProducts',
            params: {},
          }).pipe(Effect.asVoid, Effect.either),
        ],
        { concurrency: 1 },
      ).pipe(Effect.provide(AsyncLive)),
    );

    expect(results).toHaveLength(6);
    for (const result of results) {
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.code).toBe('generation-read-admission-closed');
        expect(result.left.extra).toMatchObject({
          generationId: 'gen_retired',
          phase: 'retired',
        });
      }
    }
    expect(assertGenerationAdmission).toHaveBeenCalledTimes(6);
    expect(assertGenerationAdmission).toHaveBeenCalledWith({
      generationId: 'gen_retired',
      mode: 'read',
    });
    expect(resolveFrontendProjectionLineage).not.toHaveBeenCalled();
    expect(getAggregateFrontendRepo).not.toHaveBeenCalled();
    expect(getAggregateRepo).not.toHaveBeenCalled();
    expect(getServiceFrontendRepo).not.toHaveBeenCalled();
    expect(getServiceRepo).not.toHaveBeenCalled();
  });
});
