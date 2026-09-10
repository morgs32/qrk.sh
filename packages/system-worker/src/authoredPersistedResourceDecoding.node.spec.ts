import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { system } from './fixtures/system.js';
import { projectServiceFrontendResource } from './FrontendVersionedServiceRepo/projectServiceFrontendResource/projectServiceFrontendResource.js';
import { adaptFrontendResource } from './StaticSystem/adaptFrontendResource/adaptFrontendResource.js';

describe('authored persisted resource decoding', () => {
  it.effect('decodes a hybrid aggregate row using the exact locked model', () =>
    Effect.gen(function* () {
      const model = system.aggregates.user['1.0.0']!.models.preference;
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const updatedAt = new Date('2026-01-02T00:00:00.000Z');
      const projected = yield* adaptFrontendResource({
        owner: {
          kind: 'aggregate',
          aggregateName: 'user',
          aggregateVersion: '1.0.0',
        },
        frontendName: 'main',
        modelName: model.modelName,
        modelVersion: model.version,
        resource: {
          id: model.prefixId('aggregate-projection'),
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
          id: model.prefixId('aggregate-projection'),
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
        const projected = yield* projectServiceFrontendResource({
          serviceName: 'app',
          serviceVersion: '1.0.0',
          frontendName: 'products',
          modelName: model.modelName,
          resource: {
            id: model.prefixId('service-projection'),
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
            id: model.prefixId('service-projection'),
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
        const adapted = yield* adaptFrontendResource({
          owner: {
            kind: 'aggregate',
            aggregateName: 'user',
            aggregateVersion: '1.0.0',
          },
          frontendName: 'main',
          modelName: model.modelName,
          modelVersion: '1.0.0',
          resource: {
            id: model.prefixId('historical-adaptation'),
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
