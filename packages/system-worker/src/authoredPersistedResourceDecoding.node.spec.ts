import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { projectAggregateFrontendResource } from './AggregateFrontendRepo/projectAggregateFrontendResource/projectAggregateFrontendResource.js';
import { system } from './fixtures/system.js';
import { projectServiceFrontendResource } from './ServiceFrontendRepo/projectServiceFrontendResource/projectServiceFrontendResource.js';
import { adaptFrontendResource } from './StaticSystem/adaptFrontendResource/adaptFrontendResource.js';

describe('authored persisted resource decoding', () => {
  it.effect(
    'decodes a hybrid aggregate row before aggregate frontend projection',
    () =>
      Effect.gen(function* () {
        const model = system.aggregates.user.models.preference;
        const createdAt = new Date('2026-01-01T00:00:00.000Z');
        const updatedAt = new Date('2026-01-02T00:00:00.000Z');
        const projected = yield* projectAggregateFrontendResource({
          aggregateName: 'user',
          frontendName: 'main',
          modelName: model.modelName,
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
        const model = system.services.app.models.catalogSettings;
        const createdAt = new Date('2026-02-01T00:00:00.000Z');
        const updatedAt = new Date('2026-02-02T00:00:00.000Z');
        const projected = yield* projectServiceFrontendResource({
          serviceName: 'app',
          frontendName: 'products',
          modelName: model.modelName,
          resource: {
            id: model.prefixId('service-projection'),
            modelName: model.modelName,
            version: model.version,
            createdAt,
            updatedAt,
            deletedAt: null,
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
            deletedAt: null,
            settings: JSON.stringify({ currency: 'USD' }),
          },
        });
      }),
  );

  it.effect(
    'decodes a hybrid current row before direct historical resource adaptation',
    () =>
      Effect.gen(function* () {
        const model = system.aggregates.user.models.preference;
        const createdAt = new Date('2026-03-01T00:00:00.000Z');
        const updatedAt = new Date('2026-03-02T00:00:00.000Z');
        const adapted = yield* adaptFrontendResource({
          owner: { kind: 'aggregate', aggregateName: 'user' },
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
        });

        expect(adapted).toEqual({
          modelName: model.modelName,
          resource: {
            id: model.prefixId('historical-adaptation'),
            modelName: model.modelName,
            version: '1.0.0',
            createdAt: createdAt.toISOString(),
            updatedAt: updatedAt.toISOString(),
            theme: 'solarized',
          },
        });
      }),
  );
});
