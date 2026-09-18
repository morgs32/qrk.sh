import { it } from '@effect/vitest';
import { prefixId } from '@zerospin/core/models/prefixId';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { system } from './fixtures/system.js';
import { adaptAggregateFrontendResource } from './StaticSystem/adaptAggregateFrontendResource/adaptAggregateFrontendResource.js';
import { adaptServiceFrontendResource } from './StaticSystem/adaptServiceFrontendResource/adaptServiceFrontendResource.js';

describe('authored persisted resource decoding', () => {
  it.effect('decodes a hybrid aggregate row using the exact locked model', () =>
    Effect.gen(function* () {
      const model = system.aggregates.user['1.0.0']!.models.preference;
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const updatedAt = new Date('2026-01-02T00:00:00.000Z');
      const projected = yield* adaptAggregateFrontendResource({
        aggregateName: 'user',
        aggregateVersion: '1.0.0',
        frontendName: 'main',
        modelName: model.modelName,
        modelVersion: model.version,
        resource: {
          id: prefixId(model, 'aggregate-projection'),
          modelName: model.modelName,
          version: model.version,
          createdAt,
          updatedAt,
          settings: JSON.stringify({ theme: 'dark' }),
        },
      });

      expect(projected).toEqual({
        modelName: model.modelName,
        resource: {
          id: prefixId(model, 'aggregate-projection'),
          modelName: model.modelName,
          version: model.version,
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
          settings: JSON.stringify({ theme: 'dark' }),
        },
      });
    }),
  );

  it.effect(
    'decodes a hybrid service row before service frontend projection',
    () =>
      Effect.gen(function* () {
        const model = system.services.app['1.0.0']!.models.catalogSettings;
        const createdAt = new Date('2026-02-01T00:00:00.000Z');
        const updatedAt = new Date('2026-02-02T00:00:00.000Z');
        const projected = yield* adaptServiceFrontendResource({
          serviceName: 'app',
          serviceVersion: '1.0.0',
          frontendName: 'products',
          modelVersion: model.version,
          modelName: model.modelName,
          resource: {
            id: prefixId(model, 'service-projection'),
            modelName: model.modelName,
            version: model.version,
            createdAt,
            updatedAt,
            settings: JSON.stringify({ currency: 'USD' }),
          },
        });

        expect(projected).toEqual({
          modelName: model.modelName,
          resource: {
            id: prefixId(model, 'service-projection'),
            modelName: model.modelName,
            version: model.version,
            createdAt: createdAt.toISOString(),
            updatedAt: updatedAt.toISOString(),
            settings: JSON.stringify({ currency: 'USD' }),
          },
        });
      }),
  );

  it.effect(
    'rejects a historical aggregate model version outside the exact lock',
    () =>
      Effect.gen(function* () {
        const model = system.aggregates.user['1.0.0']!.models.preference;
        const createdAt = new Date('2026-03-01T00:00:00.000Z');
        const updatedAt = new Date('2026-03-02T00:00:00.000Z');
        const adapted = yield* adaptAggregateFrontendResource({
          aggregateName: 'user',
          aggregateVersion: '1.0.0',
          frontendName: 'main',
          modelName: model.modelName,
          modelVersion: '1.0.0',
          resource: {
            id: prefixId(model, 'historical-adaptation'),
            modelName: model.modelName,
            version: model.version,
            createdAt,
            updatedAt,
            settings: JSON.stringify({ theme: 'solarized' }),
          },
        }).pipe(Effect.result);

        expect(adapted).toMatchObject({
          _tag: 'Failure',
          failure: { code: 'frontend-model-definition-missing' },
        });
      }),
  );
});
